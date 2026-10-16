import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
// Fail closed if a restricted runtime prevents the suite from completing.
process.exitCode = 1;
const startupLog = [];
const temp = await mkdtemp(join(tmpdir(), "zoology-library-test-"));
const server = createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const embedded = new EmbeddedPostgres({
  databaseDir: join(temp, "data"),
  user: "postgres",
  password: "local-test-only",
  port,
  persistent: false,
  onLog: (message) => {
    startupLog.push(message);
    if (startupLog.length > 20) startupLog.shift();
  },
  onError: (error) => console.error(error),
});
let db;
let count = 0;
const clients = [];
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = uid(1),
  staff = uid(2),
  a = uid(3),
  b = uid(4),
  pending = uid(5),
  unverified = uid(6);
async function test(name, fn) {
  await fn();
  count++;
  console.log(`PASS ${name}`);
}
async function as(user, sql, params = [], role = "authenticated") {
  const c = new pg.Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password: "local-test-only",
    database: "postgres",
  });
  await c.connect();
  clients.push(c);
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user ?? "",
    ]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
    clients.splice(clients.indexOf(c), 1);
  }
}
const rpc = (user, name, args = []) =>
  as(
    user,
    `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
    args,
  ).then((r) => r.rows[0].result);
async function denied(fn, pattern) {
  await assert.rejects(fn, pattern);
}
async function copy(accession, extra = {}) {
  const book = await rpc(staff, "save_book", [
    {
      title: "FICTIONAL TEST · Ecology",
      authors: "Test Author",
      subject: "Ecology",
    },
  ]);
  return rpc(staff, "save_copy", [
    { book_id: book, accession_number: accession, ...extra },
  ]);
}
try {
  await embedded.initialise();
  await embedded.start();
  db = new pg.Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password: "local-test-only",
    database: "postgres",
  });
  await db.connect();
  await db.query(
    await readFile(
      new URL("../supabase/tests/auth-harness.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const migration of (
    await readdir(new URL("../supabase/migrations/", import.meta.url))
  ).sort())
    await db.query(
      await readFile(
        new URL("../supabase/migrations/" + migration, import.meta.url),
        "utf8",
      ),
    );
  console.log(
    "Applied production migration to a disposable PostgreSQL cluster.",
  );
  for (const [i, id] of [admin, staff, a, b, pending, unverified].entries())
    await db.query("insert into auth.users values($1,$2,$3,$4)", [
      id,
      `fictional${i}@example.invalid`,
      id === unverified ? null : new Date(),
      {
        full_name: `Fictional Test ${i}`,
        student_id: `TEST-${i}`,
        academic_programme: "Test programme",
        department: "Test department",
        role: "admin",
        account_status: "approved",
      },
    ]);
  await db.query(
    "insert into public.staff_roles(user_id,role) values($1,'admin'),($2,'librarian')",
    [admin, staff],
  );
  await test("registration ignores metadata roles and approval flags", async () => {
    const r = await as(pending, "select * from public.profiles");
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].account_status, "pending");
    assert.equal(
      (await as(pending, "select * from public.staff_roles")).rows.length,
      0,
    );
  });
  for (const id of [a, b, unverified])
    await rpc(staff, "review_member", [id, "approved"]);
  const c1 = await copy("00001");
  await test("public catalogue preserves leading zeros and exposes only allowed fields", async () => {
    const r = await as(null, "select public.catalogue() as data", [], "anon");
    const item = r.rows[0].data.items[0];
    assert.equal(item.accession_number, "00001");
    assert.deepEqual(
      Object.keys(item).sort(),
      [
        "book_id",
        "title",
        "authors",
        "isbn",
        "publisher",
        "publication_year",
        "edition",
        "subject",
        "description",
        "copy_id",
        "accession_number",
        "shelf_location",
        "available",
      ].sort(),
    );
  });
  await test("catalogue searches title author subject and accession", async () => {
    for (const q of ["Ecology", "Test Author", "00001"]) {
      const r = await as(
        null,
        "select public.catalogue($1) as data",
        [q],
        "anon",
      );
      assert.equal(r.rows[0].data.total, 1);
    }
  });
  await test("public cannot read private tables", async () => {
    for (const t of [
      "profiles",
      "loans",
      "book_requests",
      "staff_roles",
      "audit_events",
      "books",
      "book_copies",
    ])
      await denied(
        () => as(null, `select * from public.${t}`, [], "anon"),
        /permission denied/,
      );
  });
  await test("unapproved membership cannot request", () =>
    denied(() => rpc(pending, "submit_request", [c1]), /approved membership/));
  await test("unverified approved member cannot request", () =>
    denied(() => rpc(unverified, "submit_request", [c1]), /verified email/));
  await test("self elevation and direct writes are denied", async () => {
    for (const sql of [
      "update public.profiles set account_status='approved'",
      "insert into public.staff_roles(user_id,role) values(auth.uid(),'admin')",
      "delete from public.loans",
      "update public.book_requests set status='approved'",
      "insert into public.audit_events(operation,entity_type,entity_id) values('fake','x','x')",
    ])
      await denied(() => as(a, sql), /permission denied/);
    await denied(
      () => rpc(a, "set_staff_role", [a, "admin"]),
      /Staff permission/,
    );
    await denied(
      () => rpc(staff, "set_staff_role", [staff, "admin"]),
      /Staff permission/,
    );
  });
  const req1 = await rpc(a, "submit_request", [c1]);
  await test("duplicate active requests are blocked", () =>
    denied(() => rpc(a, "submit_request", [c1]), /duplicate key/));
  await test("students cannot read or cancel another student request", async () => {
    assert.equal(
      (await as(b, "select * from public.book_requests")).rows.length,
      0,
    );
    await denied(() => rpc(b, "cancel_request", [req1]), /cannot be cancelled/);
  });
  await test("students cannot review or issue books", async () => {
    await denied(
      () => rpc(a, "review_request", [req1, true]),
      /Staff permission/,
    );
    await denied(() => rpc(a, "checkout", [c1, a]), /Staff permission/);
  });
  const req2 = await rpc(b, "submit_request", [c1]);
  await test("concurrent approvals reserve exactly once", async () => {
    const results = await Promise.allSettled([
      rpc(staff, "review_request", [req1, true]),
      rpc(admin, "review_request", [req2, true]),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  });
  const winning = (
    await db.query(
      "select * from public.book_requests where copy_id=$1 and status='approved'",
      [c1],
    )
  ).rows[0];
  await test("reservation blocks new requests and unlinked checkout", async () => {
    await denied(() => rpc(b, "submit_request", [c1]), /no longer available/);
    await denied(
      () => rpc(staff, "checkout", [c1, winning.user_id]),
      /reserved/,
    );
  });
  let loan1;
  await test("concurrent checkouts produce one active loan", async () => {
    const results = await Promise.allSettled([
      rpc(staff, "checkout", [c1, winning.user_id, winning.id]),
      rpc(admin, "checkout", [c1, winning.user_id, winning.id]),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    loan1 = results.find((r) => r.status === "fulfilled").value;
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.loans where copy_id=$1 and returned_at is null",
          [c1],
        )
      ).rows[0].n,
      1,
    );
  });
  await test("request is fulfilled only at physical checkout", async () => {
    assert.equal(
      (
        await db.query("select status from public.book_requests where id=$1", [
          winning.id,
        ])
      ).rows[0].status,
      "fulfilled",
    );
  });
  await test("active loan removes public availability", async () => {
    const r = await as(
      null,
      "select public.catalogue('00001','','',true) as data",
      [],
      "anon",
    );
    assert.equal(r.rows[0].data.total, 0);
  });
  await test("cross-user loan access is blocked by RLS", async () => {
    const other = winning.user_id === a ? b : a;
    assert.equal(
      (await as(other, "select * from public.loans")).rows.length,
      0,
    );
    assert.equal(
      (await as(winning.user_id, "select * from public.loans")).rows.length,
      1,
    );
  });
  await test("students cannot check in or change due dates", async () => {
    await denied(() => rpc(a, "checkin", [loan1]), /Staff permission/);
    await denied(
      () => rpc(a, "change_due_date", [loan1, new Date(Date.now() + 86400000)]),
      /Staff permission/,
    );
  });
  await test("due date change is recorded", async () => {
    await rpc(staff, "change_due_date", [
      loan1,
      new Date(Date.now() + 3 * 86400000),
    ]);
    assert.ok(
      (
        await db.query(
          "select * from public.audit_events where entity_id=$1 and operation='UPDATE'",
          [loan1],
        )
      ).rowCount > 0,
    );
  });
  await test("overdue query detects only active overdue loans", async () => {
    await db.query(
      "update public.loans set checkout_at=now()-interval '3 days',due_at=now()-interval '1 day' where id=$1",
      [loan1],
    );
    assert.equal(
      (
        await as(
          staff,
          "select * from public.loans where returned_at is null and due_at<now()",
        )
      ).rows.length,
      1,
    );
  });
  await test("concurrent check-in records one return", async () => {
    const results = await Promise.allSettled([
      rpc(staff, "checkin", [loan1, "damaged"]),
      rpc(admin, "checkin", [loan1, "damaged"]),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  });
  await test("damaged return remains unavailable", async () => {
    await denied(() => rpc(staff, "checkout", [c1, a]), /cannot be circulated/);
    assert.equal(
      (await as(null, "select public.catalogue('00001') as data", [], "anon"))
        .rows[0].data.items[0].available,
      false,
    );
  });
  await test("withdrawn missing lost and damaged copies cannot be issued", async () => {
    for (const status of ["withdrawn", "missing", "lost"]) {
      const c = await copy(`TEST-${status}`, { inventory_status: status });
      await denied(
        () => rpc(staff, "checkout", [c, a]),
        /cannot be circulated/,
      );
    }
  });
  const c2 = await copy("00002");
  let cancelReq = await rpc(a, "submit_request", [c2]);
  await test("student cancellation releases reservation", async () => {
    await rpc(staff, "review_request", [cancelReq, true]);
    await rpc(a, "cancel_request", [cancelReq]);
    assert.equal(
      (await as(null, "select public.catalogue('00002') as data", [], "anon"))
        .rows[0].data.items[0].available,
      true,
    );
  });
  await test("staff rejection records reason", async () => {
    const r = await rpc(a, "submit_request", [c2]);
    await rpc(staff, "review_request", [r, false, "Check membership card"]);
    assert.equal(
      (
        await as(
          a,
          "select review_note from public.book_requests where id=$1",
          [r],
        )
      ).rows[0].review_note,
      "Check membership card",
    );
  });
  await test("expired reservation releases copy and cannot be issued", async () => {
    const r = await rpc(a, "submit_request", [c2]);
    await rpc(staff, "review_request", [r, true]);
    await db.query(
      "update public.book_requests set expires_at=now()-interval '1 minute' where id=$1",
      [r],
    );
    assert.equal(
      (await as(null, "select public.catalogue('00002') as data", [], "anon"))
        .rows[0].data.items[0].available,
      true,
    );
    await denied(() => rpc(staff, "checkout", [c2, a, r]), /Valid approved/);
    await rpc(b, "submit_request", [c2]);
  });
  await test("duplicate accession is rejected without normalizing", async () => {
    const book = (
      await db.query("select book_id from public.book_copies where id=$1", [c2])
    ).rows[0].book_id;
    await denied(
      () =>
        rpc(staff, "save_copy", [{ book_id: book, accession_number: "00002" }]),
      /duplicate key/,
    );
    const c = await rpc(staff, "save_copy", [
      { book_id: book, accession_number: " 00002 " },
    ]);
    assert.equal(
      (
        await db.query(
          "select accession_number from public.book_copies where id=$1",
          [c],
        )
      ).rows[0].accession_number,
      " 00002 ",
    );
  });
  const imported = [
    {
      title: "FICTIONAL TEST · CSV",
      authors: "Test Writer",
      accession_number: "000CSV",
      shelf_location: "TEST",
    },
  ];
  await test("CSV import is atomic and repeat-safe", async () => {
    assert.deepEqual(
      await rpc(staff, "import_catalogue", [JSON.stringify(imported)]),
      { added: 1, skipped: 0 },
    );
    assert.deepEqual(
      await rpc(staff, "import_catalogue", [JSON.stringify(imported)]),
      { added: 0, skipped: 1 },
    );
    await denied(
      () =>
        rpc(staff, "import_catalogue", [
          JSON.stringify([
            { ...imported[0], accession_number: "ROLLBACK" },
            { ...imported[0], title: "Conflict" },
          ]),
        ]),
      /different data/,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.book_copies where accession_number='ROLLBACK'",
        )
      ).rowCount,
      0,
    );
  });
  await test("CSV rejects missing fields and duplicate rows", async () => {
    await denied(
      () =>
        rpc(staff, "import_catalogue", [JSON.stringify([{ title: "Test" }])]),
      /required/,
    );
    await denied(
      () =>
        rpc(staff, "import_catalogue", [
          JSON.stringify([imported[0], imported[0]]),
        ]),
      /duplicate accession/,
    );
  });
  await test("identity edit resets approval", async () => {
    await rpc(a, "update_my_profile", [
      "Changed Test Name",
      "TEST-2",
      "Test programme",
      "Test department",
    ]);
    assert.equal(
      (await as(a, "select account_status from public.profiles")).rows[0]
        .account_status,
      "pending",
    );
    await denied(() => rpc(a, "submit_request", [c2]), /approved membership/);
    await rpc(staff, "review_member", [a, "approved"]);
  });
  await test("ordinary librarian cannot change policy or read audit", async () => {
    await denied(
      () => rpc(staff, "update_settings", [3, 14, 48, 5]),
      /Staff permission/,
    );
    assert.equal(
      (await as(staff, "select * from public.audit_events")).rows.length,
      0,
    );
  });
  await test("administrator policy update persists, is audited and rolls back invalid values", async () => {
    await rpc(admin, "update_settings", [4, 21, 72, 6]);
    const policy = (
      await as(admin, "select * from public.system_settings where id = true")
    ).rows[0];
    assert.equal(policy.max_active_loans, 4);
    assert.equal(policy.loan_days, 21);
    assert.equal(policy.reservation_hours, 72);
    assert.equal(policy.max_active_requests, 6);
    const audit = await as(
      admin,
      "select * from public.audit_events where entity_type = 'system_settings' and actor_id = auth.uid() order by id desc limit 1",
    );
    assert.equal(audit.rows[0].details.after.loan_days, 21);
    await denied(
      () => rpc(admin, "update_settings", [4, 0, 72, 6]),
      /check constraint/,
    );
    assert.equal(
      (
        await as(
          admin,
          "select loan_days from public.system_settings where id = true",
        )
      ).rows[0].loan_days,
      21,
    );
  });
  await test("administrator role grant revoke and last-admin protection", async () => {
    await rpc(admin, "set_staff_role", [b, "librarian"]);
    assert.equal(
      (
        await as(
          b,
          "select role from public.staff_roles where user_id=auth.uid()",
        )
      ).rows[0].role,
      "librarian",
    );
    await rpc(admin, "set_staff_role", [b, null]);
    await denied(
      () => rpc(admin, "set_staff_role", [admin, null]),
      /last administrator/,
    );
  });
  await test("borrowing and request limits survive concurrent actions", async () => {
    await rpc(admin, "update_settings", [1, 14, 48, 1]);
    const x = await copy("LIMIT-X"),
      y = await copy("LIMIT-Y");
    const results = await Promise.allSettled([
      rpc(a, "submit_request", [x]),
      rpc(a, "submit_request", [y]),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const r = (
      await db.query(
        "select * from public.book_requests where user_id=$1 and status='pending'",
        [a],
      )
    ).rows[0];
    await rpc(staff, "review_request", [r.id, true]);
    await denied(
      () => rpc(staff, "checkout", [r.copy_id === x ? y : x, a]),
      /Borrowing limit/,
    );
    await rpc(staff, "checkout", [r.copy_id, a, r.id]);
    await denied(
      () => rpc(a, "submit_request", [r.copy_id === x ? y : x]),
      /Borrowing limit/,
    );
  });
  await test("private circulation RPC is scoped to the current student", async () => {
    const mine = await rpc(a, "my_circulation");
    assert.ok(mine.requests.every((r) => r.user_id === a));
    assert.ok(mine.loans.every((l) => l.user_id === a));
    assert.ok(mine.loans[0].accession_number);
    await denied(
      () => as(null, "select public.my_circulation()", [], "anon"),
      /permission denied/,
    );
  });
  await test("all app tables have RLS enabled and anon has no helper execute", async () => {
    const r = await db.query(
      "select relname,relrowsecurity from pg_class join pg_namespace on pg_namespace.oid=relnamespace where nspname='public' and relkind='r'",
    );
    assert.equal(r.rows.length, 8);
    assert.ok(r.rows.every((x) => x.relrowsecurity));
    await denied(
      () => as(null, "select private.copy_available($1)", [c1], "anon"),
      /permission denied/,
    );
  });
  process.exitCode = 0;
  console.log(
    `\n${count} database integration/security tests passed (real PostgreSQL, independent connections for races).`,
  );
} catch (error) {
  console.error(startupLog.join("\n"));
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const c of clients) await c.end().catch(() => {});
  await db?.end();
  await embedded.stop().catch(() => {});
  await rm(temp, { recursive: true, force: true });
}
