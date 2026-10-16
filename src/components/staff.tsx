import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Clock,
  Users,
  TriangleAlert,
  Download,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useWorkspace, type Workspace } from "../lib/workspace";
import { rpc } from "../lib/supabase";
import {
  date,
  effectiveStatus,
  isOverdue,
  type Book,
  type Copy,
} from "../lib/types";
import {
  download,
  headers,
  maxCsvBytes,
  parseCatalogue,
  template,
  toCsv,
  type PreviewRow,
} from "../lib/csv";
import {
  Badge,
  Confirm,
  Empty,
  ErrorBox,
  Field,
  Loading,
  PageTitle,
  submit,
  textValue,
  useAction,
} from "./ui";
type Decision = {
  title: string;
  body: string;
  action: () => Promise<unknown>;
  success: string;
};
export function Staff({ view = "dashboard" }: { view?: string }) {
  const data = useWorkspace();
  const action = useAction(data.refresh);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [decision, setDecision] = useState<Decision | null>(null),
    [selectedBook, setSelectedBook] = useState<Book | "new" | null>(null),
    [selectedCopy, setSelectedCopy] = useState<Copy | "new" | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]),
    [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<{
    added: number;
    skipped: number;
  } | null>(null);
  const member = (id: string) => data.profiles.find((p) => p.id === id),
    copy = (id: string) => data.copies.find((c) => c.id === id),
    book = (id: string) => data.books.find((b) => b.id === copy(id)?.book_id);
  const label = (id: string) => (
    <>
      <strong>{book(id)?.title || "Book record"}</strong>
      <small className="accession">{copy(id)?.accession_number || id}</small>
    </>
  );
  const who = (id: string) => (
    <>
      {member(id)?.full_name || "Member"}
      <small>{member(id)?.student_id}</small>
    </>
  );
  const matches = (...values: unknown[]) =>
    values.join(" ").toLowerCase().includes(query.toLowerCase());
  const active = data.loans.filter((l) => !l.returned_at),
    overdue = active.filter((l) => isOverdue(l)),
    pending = data.requests.filter((r) => effectiveStatus(r) === "pending");
  const titles: Record<string, string> = {
    dashboard: "Library at a glance",
    members: "Membership approvals",
    requests: "Book requests",
    checkout: "Issue a book",
    checkin: "Receive a book",
    loans: "Active & overdue loans",
    catalogue: "Catalogue management",
    import: "Import physical copies",
    reports: "Library reports",
  };
  function decide(
    title: string,
    body: string,
    fn: () => Promise<unknown>,
    success: string,
  ) {
    setDecision({ title, body, action: fn, success });
  }
  function toolbar(children?: ReactNode) {
    return (
      <div className="toolbar">
        <label className="field grow">
          <span>Search this view</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, accession, name or student ID"
          />
        </label>
        {children}
      </div>
    );
  }
  function exportCatalogue() {
    const records = data.copies.map((c) => {
      const b = data.books.find((b) => b.id === c.book_id)!;
      return Object.fromEntries(
        headers.map((h) => [
          h,
          h === "book_id"
            ? b.id
            : h in c
              ? (c[h as keyof Copy] ?? "")
              : (b[h as keyof Book] ?? ""),
        ]),
      );
    });
    download("library-catalogue.csv", toCsv(records, [...headers]));
  }
  async function filePreview(file: File | undefined) {
    setPreview([]);
    setImportError("");
    setImportResult(null);
    if (!file) return;
    try {
      if (file.size > maxCsvBytes)
        throw new Error("CSV file exceeds 2 MB. Split it into smaller files.");
      const rows = parseCatalogue(await file.text());
      for (const r of rows) {
        const existing = data.copies.find(
          (c) => c.accession_number === r.data.accession_number,
        );
        if (existing) {
          const b = data.books.find((b) => b.id === existing.book_id)!;
          for (const k of headers) {
            if (k === "book_id" && !r.data.book_id) continue;
            const value =
              k === "book_id"
                ? existing.book_id
                : k in existing
                  ? existing[k as keyof Copy]
                  : b[k as keyof Book];
            if (String(value ?? "") !== r.data[k]) {
              r.errors.push(
                `Accession already exists with different ${k}; edit the record explicitly`,
              );
              break;
            }
          }
        }
      }
      setPreview(rows);
    } catch (e) {
      setImportError((e as Error).message);
    }
  }
  if (data.loading) return <Loading />;
  return (
    <>
      <PageTitle
        eyebrow="LIBRARIAN WORKSPACE"
        title={titles[view] || "Library workspace"}
      >
        <button
          className="button secondary"
          disabled={action.busy}
          onClick={() => void data.refresh()}
        >
          <RefreshCw size={16} /> Refresh records
        </button>
      </PageTitle>
      <ErrorBox message={data.error || action.error} />
      {view === "dashboard" && (
        <>
          <div className="stats">
            <Link to="/staff/requests">
              <Clock />
              <strong>{pending.length}</strong>
              <span>Pending requests</span>
            </Link>
            <Link to="/staff/loans">
              <BookOpen />
              <strong>{active.length}</strong>
              <span>Active loans</span>
            </Link>
            <Link to="/staff/loans">
              <TriangleAlert />
              <strong>{overdue.length}</strong>
              <span>Overdue books</span>
            </Link>
            <Link to="/staff/members">
              <Users />
              <strong>
                {
                  data.profiles.filter((p) => p.account_status === "pending")
                    .length
                }
              </strong>
              <span>Awaiting approval</span>
            </Link>
          </div>
          <div className="two-col">
            <article className="panel">
              <p className="eyebrow">CIRCULATION DESK</p>
              <h2>Physical books, verified handovers.</h2>
              <p className="muted">
                A request reserves a copy only after approval. Verify the
                student’s identity and exact accession number at collection.
              </p>
              <div className="actions">
                <Link className="button" to="/staff/checkout">
                  Issue a book
                </Link>
                <Link className="button secondary" to="/staff/checkin">
                  Receive a book
                </Link>
              </div>
            </article>
            <article className="panel">
              <p className="eyebrow">COLLECTION</p>
              <h2>
                {data.books.length} titles · {data.copies.length} physical
                copies
              </h2>
              <p className="muted">
                Keep shelf locations and physical conditions current to help
                readers find the right copy.
              </p>
              <Link className="text-link" to="/staff/catalogue">
                Manage the catalogue →
              </Link>
            </article>
          </div>
        </>
      )}
      {view === "members" && (
        <>
          {toolbar(
            <Field label="Membership status" name="filter">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                {["pending", "approved", "rejected", "suspended"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>,
          )}
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Programme / department</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {data.profiles
                  .filter(
                    (p) =>
                      (filter === "all" || p.account_status === filter) &&
                      matches(p.full_name, p.student_id, p.email),
                  )
                  .map((p) => (
                    <tr key={p.id}>
                      <td>{who(p.id)}</td>
                      <td>
                        {p.academic_programme}
                        <small>{p.department}</small>
                      </td>
                      <td>{p.email}</td>
                      <td>
                        <Badge value={p.account_status} />
                      </td>
                      <td>
                        <div className="actions">
                          {["approved", "rejected", "suspended"]
                            .filter((s) => s !== p.account_status)
                            .map((s) => (
                              <button
                                key={s}
                                className="button secondary small-button"
                                disabled={action.busy}
                                onClick={() =>
                                  decide(
                                    `${s === "approved" ? "Approve" : s === "rejected" ? "Reject" : "Suspend"} membership?`,
                                    `${p.full_name} · ${p.student_id}. Non-approved memberships lose pending requests and reservations. Existing loans still require return.`,
                                    () =>
                                      rpc("review_member", {
                                        p_user_id: p.id,
                                        p_status: s,
                                      }),
                                    "Membership updated.",
                                  )
                                }
                              >
                                {s === "approved"
                                  ? "Approve"
                                  : s === "rejected"
                                    ? "Reject"
                                    : "Suspend"}
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!data.profiles.length && (
              <Empty>New student registrations will appear here.</Empty>
            )}
          </div>
        </>
      )}
      {view === "requests" && (
        <>
          {toolbar(
            <Field label="Request status" name="filter">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                {[
                  "pending",
                  "approved",
                  "rejected",
                  "cancelled",
                  "expired",
                  "fulfilled",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>,
          )}
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Book / accession</th>
                  <th>Student</th>
                  <th>Requested / expires</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {[...data.requests]
                  .sort((a, b) => b.requested_at.localeCompare(a.requested_at))
                  .filter(
                    (r) =>
                      (filter === "all" || effectiveStatus(r) === filter) &&
                      matches(
                        book(r.copy_id)?.title,
                        copy(r.copy_id)?.accession_number,
                        member(r.user_id)?.full_name,
                        member(r.user_id)?.student_id,
                      ),
                  )
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{label(r.copy_id)}</td>
                      <td>{who(r.user_id)}</td>
                      <td>
                        {date(r.requested_at)}
                        <small>
                          {r.expires_at
                            ? `Collection: ${date(r.expires_at)}`
                            : r.review_note}
                        </small>
                      </td>
                      <td>
                        <Badge value={effectiveStatus(r)} />
                      </td>
                      <td>
                        {effectiveStatus(r) === "pending" ? (
                          <form
                            onSubmit={submit(async (d) => {
                              const approve = d.get("decision") === "approve";
                              decide(
                                approve
                                  ? "Approve and reserve this copy?"
                                  : "Reject this request?",
                                `${member(r.user_id)?.full_name} · accession ${copy(r.copy_id)?.accession_number}. Approval reserves the copy for ${data.settings[0]?.reservation_hours ?? 48} hours.`,
                                () =>
                                  rpc("review_request", {
                                    p_request_id: r.id,
                                    p_approve: approve,
                                    p_note: textValue(d, "note"),
                                  }),
                                approve
                                  ? "Request approved. Copy reserved."
                                  : "Request rejected.",
                              );
                            })}
                          >
                            <label className="sr-only" htmlFor={"note-" + r.id}>
                              Review note
                            </label>
                            <input
                              id={"note-" + r.id}
                              name="note"
                              placeholder="Optional review note"
                              maxLength={500}
                            />
                            <div className="actions">
                              <button
                                className="button small-button"
                                name="decision"
                                value="approve"
                              >
                                Approve
                              </button>
                              <button
                                className="button secondary small-button"
                                name="decision"
                                value="reject"
                              >
                                Reject
                              </button>
                            </div>
                          </form>
                        ) : effectiveStatus(r) === "approved" ? (
                          <Link
                            className="text-link"
                            to={"/staff/checkout?request=" + r.id}
                          >
                            Record collection →
                          </Link>
                        ) : (
                          <span className="muted">
                            {r.review_note || "No action required"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!data.requests.length && (
              <Empty>No requests have been submitted.</Empty>
            )}
          </div>
        </>
      )}
      {view === "checkout" && <Checkout data={data} onDecision={decide} />}
      {view === "checkin" && (
        <>
          {toolbar()}
          <p className="muted">
            Match the physical accession number before confirming receipt. A
            damaged return stays unavailable.
          </p>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Book / accession</th>
                  <th>Borrower</th>
                  <th>Due</th>
                  <th>Physical return</th>
                </tr>
              </thead>
              <tbody>
                {active
                  .filter((l) =>
                    matches(
                      book(l.copy_id)?.title,
                      copy(l.copy_id)?.accession_number,
                      member(l.user_id)?.full_name,
                      member(l.user_id)?.student_id,
                    ),
                  )
                  .map((l) => (
                    <tr key={l.id}>
                      <td>{label(l.copy_id)}</td>
                      <td>{who(l.user_id)}</td>
                      <td>
                        {date(l.due_at)}{" "}
                        {isOverdue(l) && <Badge value="overdue" />}
                      </td>
                      <td>
                        <form
                          className="actions"
                          onSubmit={submit(async (d) => {
                            decide(
                              "Confirm physical return?",
                              `Accession ${copy(l.copy_id)?.accession_number} from ${member(l.user_id)?.full_name}. Confirm you have received and inspected the book.`,
                              () =>
                                rpc("checkin", {
                                  p_loan_id: l.id,
                                  p_condition: textValue(d, "condition"),
                                }),
                              "Return recorded.",
                            );
                          })}
                        >
                          <Field label="Condition on return" name="condition">
                            <select name="condition">
                              <option value="good">Good</option>
                              <option value="worn">Worn</option>
                              <option value="damaged">Damaged</option>
                            </select>
                          </Field>
                          <button className="button" disabled={action.busy}>
                            Record check-in
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!active.length && (
              <Empty>No books are currently checked out.</Empty>
            )}
          </div>
        </>
      )}
      {view === "loans" && (
        <>
          {toolbar(
            <label className="check">
              <input
                type="checkbox"
                checked={filter === "overdue"}
                onChange={(e) =>
                  setFilter(e.target.checked ? "overdue" : "all")
                }
              />{" "}
              Overdue only
            </label>,
          )}
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Book / accession</th>
                  <th>Borrower</th>
                  <th>Issued</th>
                  <th>Due / status</th>
                  <th>Change due date</th>
                </tr>
              </thead>
              <tbody>
                {active
                  .filter(
                    (l) =>
                      (filter !== "overdue" || isOverdue(l)) &&
                      matches(
                        book(l.copy_id)?.title,
                        copy(l.copy_id)?.accession_number,
                        member(l.user_id)?.full_name,
                        member(l.user_id)?.student_id,
                      ),
                  )
                  .map((l) => (
                    <tr key={l.id}>
                      <td>{label(l.copy_id)}</td>
                      <td>{who(l.user_id)}</td>
                      <td>{date(l.checkout_at)}</td>
                      <td>
                        {date(l.due_at)}
                        <small>
                          <Badge value={isOverdue(l) ? "overdue" : "active"} />
                        </small>
                      </td>
                      <td>
                        <form
                          className="actions"
                          onSubmit={submit(async (d) => {
                            const due = new Date(
                              textValue(d, "due"),
                            ).toISOString();
                            decide(
                              "Change the due date?",
                              `New due date: ${date(due)} for accession ${copy(l.copy_id)?.accession_number}.`,
                              () =>
                                rpc("change_due_date", {
                                  p_loan_id: l.id,
                                  p_due_at: due,
                                }),
                              "Due date updated.",
                            );
                          })}
                        >
                          <Field
                            label="New due date (local time)"
                            name="due"
                            type="datetime-local"
                            required
                          />
                          <button
                            className="button secondary"
                            disabled={action.busy}
                          >
                            Update
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!active.length && <Empty>No active loans.</Empty>}
          </div>
        </>
      )}
      {view === "catalogue" && (
        <>
          {toolbar(
            <>
              <button
                className="button"
                onClick={() => {
                  setSelectedBook("new");
                  setSelectedCopy(null);
                }}
              >
                <Plus size={16} /> Add title
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setSelectedCopy("new");
                  setSelectedBook(null);
                }}
                disabled={!data.books.length}
              >
                Add physical copy
              </button>
              <button className="button secondary" onClick={exportCatalogue}>
                <Download size={16} /> Export CSV
              </button>
            </>,
          )}
          {selectedBook && (
            <BookEditor
              key={typeof selectedBook === "string" ? "new" : selectedBook.id}
              book={selectedBook}
              busy={action.busy}
              close={() => setSelectedBook(null)}
              save={async (book, id) => {
                const ok = await action.run(
                  () => rpc("save_book", { p_book: book, p_id: id }),
                  "Title saved. Add a physical copy to make it visible in the catalogue.",
                );
                if (ok) setSelectedBook(null);
              }}
            />
          )}
          {selectedCopy && (
            <CopyEditor
              key={typeof selectedCopy === "string" ? "new" : selectedCopy.id}
              copy={selectedCopy}
              data={data}
              busy={action.busy}
              close={() => setSelectedCopy(null)}
              save={(record, id) =>
                decide(
                  id ? "Save copy changes?" : "Add a physical copy?",
                  `Accession ${record.accession_number}. Existing accession numbers cannot be changed.`,
                  async () => {
                    await rpc("save_copy", { p_copy: record, p_id: id });
                    setSelectedCopy(null);
                  },
                  "Physical copy saved.",
                )
              }
            />
          )}
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title / author</th>
                  <th>Publication</th>
                  <th>Physical copies</th>
                  <th>Manage</th>
                </tr>
              </thead>
              <tbody>
                {data.books
                  .filter((b) =>
                    matches(
                      b.title,
                      b.authors,
                      b.subject,
                      ...data.copies
                        .filter((c) => c.book_id === b.id)
                        .map((c) => c.accession_number),
                    ),
                  )
                  .map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.title}</strong>
                        <small>
                          {b.authors} · {b.subject}
                        </small>
                        <small className="muted">Book ID: {b.id}</small>
                      </td>
                      <td>
                        {[b.publisher, b.edition, b.publication_year]
                          .filter(Boolean)
                          .join(" · ")}
                        <small>{b.isbn}</small>
                      </td>
                      <td>
                        {data.copies
                          .filter((c) => c.book_id === b.id)
                          .map((c) => (
                            <div className="copy-row" key={c.id}>
                              <span className="accession">
                                {c.accession_number}
                              </span>
                              <Badge
                                value={
                                  c.inventory_status === "active"
                                    ? c.physical_condition
                                    : c.inventory_status
                                }
                              />
                              <span>{c.shelf_location}</span>
                              <button
                                className="text-link"
                                onClick={() => {
                                  setSelectedCopy(c);
                                  setSelectedBook(null);
                                }}
                              >
                                Edit copy
                              </button>
                            </div>
                          ))}
                      </td>
                      <td>
                        <button
                          className="button secondary"
                          onClick={() => {
                            setSelectedBook(b);
                            setSelectedCopy(null);
                          }}
                        >
                          Edit title
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!data.books.length && (
              <Empty>
                The catalogue is empty. Add a title, then add its physical
                copies, or import a CSV.
              </Empty>
            )}
          </div>
        </>
      )}
      {view === "import" && (
        <>
          <div className="panel">
            <h2>One row. One accessioned copy.</h2>
            <p className="muted">
              Use at most 500 rows and 2 MB per file. Keep accession columns as
              text, including leading zeroes and spaces. Identical repeated rows
              are skipped; conflicting accession numbers block the entire
              import.
            </p>
            <div className="actions">
              <button className="button secondary" onClick={template}>
                <Download size={16} /> Download empty template
              </button>
              <Field label="Choose catalogue CSV" name="csv">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => void filePreview(e.target.files?.[0])}
                />
              </Field>
            </div>
            <p className="muted small">
              Optional book_id links copies to a known title. Otherwise all
              bibliographic fields must match for copies to share a title. This
              preview checks file data and known accession conflicts; the
              database validates the complete batch again on commit.
            </p>
          </div>
          <ErrorBox message={importError} />
          {importResult && (
            <div role="status" className="notice">
              Import completed: {importResult.added} copies added;{" "}
              {importResult.skipped} identical existing copies skipped.
            </div>
          )}
          {preview.length > 0 && (
            <>
              <div className="toolbar">
                <strong>
                  {preview.length} rows ·{" "}
                  {preview.filter((r) => r.errors.length).length} invalid
                </strong>
                <button
                  className="button secondary"
                  disabled={!preview.some((r) => r.errors.length)}
                  onClick={() =>
                    download(
                      "rejected-rows.csv",
                      toCsv(
                        preview
                          .filter((r) => r.errors.length)
                          .map((r) => ({
                            ...r.data,
                            errors: r.errors.join("; "),
                            csv_row: r.line,
                          })),
                      ),
                    )
                  }
                >
                  Download rejected rows
                </button>
                <button
                  className="button"
                  disabled={
                    preview.some((r) => r.errors.length > 0) || action.busy
                  }
                  onClick={() =>
                    decide(
                      "Commit this catalogue import?",
                      `${preview.length} rows will be checked and imported atomically. Identical existing copies will be skipped.`,
                      async () => {
                        const result = await rpc<{
                          added: number;
                          skipped: number;
                        }>("import_catalogue", {
                          p_rows: preview.map((r) => r.data),
                        });
                        setImportResult(result);
                        setPreview([]);
                        return result;
                      },
                      "Import complete. Refresh the catalogue to inspect the copies.",
                    )
                  }
                >
                  Commit valid batch
                </button>
              </div>
              <div className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>CSV row</th>
                      <th>Accession</th>
                      <th>Title / author</th>
                      <th>Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr key={r.line}>
                        <td>{r.line}</td>
                        <td className="accession">{r.data.accession_number}</td>
                        <td>
                          {r.data.title}
                          <small>{r.data.authors}</small>
                        </td>
                        <td>
                          {r.errors.length ? (
                            <span className="error-text">
                              {r.errors.join("; ")}
                            </span>
                          ) : (
                            <Badge value="ready" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      {view === "reports" && (
        <div className="two-col">
          <article className="panel">
            <h2>Catalogue exports</h2>
            <p className="muted">
              CSV for review and reporting. JSON preserves exact values for
              transfer and backup, including accession numbers.
            </p>
            <div className="actions">
              <button className="button secondary" onClick={exportCatalogue}>
                Catalogue CSV
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  download(
                    "catalogue-backup.json",
                    JSON.stringify(
                      {
                        format: "zoology-library-catalogue-v1",
                        exported_at: new Date().toISOString(),
                        books: data.books,
                        copies: data.copies,
                      },
                      null,
                      2,
                    ),
                    "application/json",
                  )
                }
              >
                Exact catalogue JSON
              </button>
            </div>
          </article>
          <article className="panel">
            <h2>Circulation reports</h2>
            <p className="muted">
              These reports contain student information. Store them in a
              restricted departmental location.
            </p>
            <div className="actions">
              {[
                ["Active loans", active],
                ["Overdue loans", overdue],
                ["Loan history", data.loans],
              ].map(([title, records]) => (
                <button
                  className="button secondary"
                  key={String(title)}
                  onClick={() =>
                    download(
                      String(title).toLowerCase().replaceAll(" ", "-") + ".csv",
                      toCsv(
                        (records as typeof active).map((l) => ({
                          ...l,
                          title: book(l.copy_id)?.title,
                          accession_number: copy(l.copy_id)?.accession_number,
                          full_name: member(l.user_id)?.full_name,
                          student_id: member(l.user_id)?.student_id,
                        })),
                      ),
                    )
                  }
                >
                  {String(title)}
                </button>
              ))}
              <button
                className="button secondary"
                onClick={() =>
                  download(
                    "requests.csv",
                    toCsv(
                      data.requests.map((r) => ({
                        ...r,
                        effective_status: effectiveStatus(r),
                        accession_number: copy(r.copy_id)?.accession_number,
                        full_name: member(r.user_id)?.full_name,
                        student_id: member(r.user_id)?.student_id,
                      })),
                    ),
                  )
                }
              >
                Requests CSV
              </button>
            </div>
            <p className="muted small">
              Overdue is calculated from due time and return status. This system
              does not calculate fines.
            </p>
          </article>
        </div>
      )}
      {decision && (
        <Confirm
          title={decision.title}
          busy={action.busy}
          onClose={() => setDecision(null)}
          onConfirm={() =>
            void action.run(decision.action, decision.success).then((ok) => {
              if (ok) setDecision(null);
            })
          }
        >
          {decision.body}
          <ErrorBox message={action.error} />
        </Confirm>
      )}
    </>
  );
}
function Checkout({
  data,
  onDecision,
}: {
  data: Workspace;
  onDecision: (
    title: string,
    body: string,
    fn: () => Promise<unknown>,
    success: string,
  ) => void;
}) {
  const preselected =
    new URLSearchParams(window.location.hash.split("?")[1]).get("request") ||
    "";
  const [reservation, setReservation] = useState(preselected);
  const req = data.requests.find((r) => r.id === reservation);
  return (
    <div className="panel narrow">
      <h2>Record a physical checkout</h2>
      <p className="muted">
        Select an approved reservation or issue an unreserved copy directly.
        Confirm the student’s identity and the physical accession number before
        issuing.
      </p>
      <form
        key={reservation}
        onSubmit={submit(async (d) => {
          const copyId = req?.copy_id || textValue(d, "copy_id"),
            userId = req?.user_id || textValue(d, "user_id");
          const c = data.copies.find((c) => c.id === copyId),
            p = data.profiles.find((p) => p.id === userId);
          onDecision(
            "Confirm physical checkout?",
            `${p?.full_name} (${p?.student_id}) · accession ${c?.accession_number}. Confirm both the student and physical book are present.`,
            () =>
              rpc("checkout", {
                p_copy_id: copyId,
                p_user_id: userId,
                p_request_id: req?.id ?? null,
                p_due_at: textValue(d, "due")
                  ? new Date(textValue(d, "due")).toISOString()
                  : null,
              }),
            "Book issued. Loan and due date recorded.",
          );
        })}
      >
        <Field label="Approved reservation (optional)" name="request">
          <select
            value={reservation}
            onChange={(e) => setReservation(e.target.value)}
          >
            <option value="">Direct checkout without a reservation</option>
            {data.requests
              .filter((r) => effectiveStatus(r) === "approved")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {
                    data.copies.find((c) => c.id === r.copy_id)
                      ?.accession_number
                  }{" "}
                  · {data.profiles.find((p) => p.id === r.user_id)?.full_name} ·
                  expires {date(r.expires_at)}
                </option>
              ))}
          </select>
        </Field>
        {req ? (
          <div className="notice">
            Reserved for{" "}
            {data.profiles.find((p) => p.id === req.user_id)?.full_name} ·
            accession{" "}
            <span className="accession">
              {data.copies.find((c) => c.id === req.copy_id)?.accession_number}
            </span>
          </div>
        ) : (
          <>
            <Field label="Approved student" name="user_id">
              <select name="user_id" required defaultValue="">
                <option value="" disabled>
                  Select student by name and ID
                </option>
                {data.profiles
                  .filter((p) => p.account_status === "approved")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} · {p.student_id}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Physical copy" name="copy_id">
              <select name="copy_id" required defaultValue="">
                <option value="" disabled>
                  Select exact accession number
                </option>
                {data.copies
                  .filter(
                    (c) =>
                      c.inventory_status === "active" &&
                      c.physical_condition !== "damaged" &&
                      !data.loans.some(
                        (l) => l.copy_id === c.id && !l.returned_at,
                      ) &&
                      !data.requests.some(
                        (r) =>
                          r.copy_id === c.id &&
                          effectiveStatus(r) === "approved",
                      ),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.accession_number} ·{" "}
                      {data.books.find((b) => b.id === c.book_id)?.title}
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
        <Field
          label={`Due date (optional; default ${data.settings[0]?.loan_days ?? 14} days, local time)`}
          name="due"
          type="datetime-local"
        />
        <label className="check">
          <input type="checkbox" required /> I verified the student and the
          physical accession number.
        </label>
        <button className="button full">Record checkout</button>
      </form>
    </div>
  );
}
function BookEditor({
  book,
  busy,
  save,
  close,
}: {
  book: Book | "new";
  busy: boolean;
  save: (b: Record<string, unknown>, id: string | null) => Promise<void>;
  close: () => void;
}) {
  const b = typeof book === "string" ? null : book;
  return (
    <div className="panel editor">
      <h2>{b ? "Edit bibliographic title" : "Add a bibliographic title"}</h2>
      <form
        onSubmit={submit(async (d) => {
          await save(Object.fromEntries(d), b?.id ?? null);
        })}
      >
        <div className="form-grid">
          <Field
            label="Title"
            name="title"
            defaultValue={b?.title}
            required
            maxLength={500}
          />
          <Field
            label="Authors"
            name="authors"
            defaultValue={b?.authors}
            required
            maxLength={500}
          />
          <Field
            label="ISBN"
            name="isbn"
            defaultValue={b?.isbn}
            maxLength={32}
          />
          <Field
            label="Publisher"
            name="publisher"
            defaultValue={b?.publisher}
            maxLength={300}
          />
          <Field
            label="Publication year"
            name="publication_year"
            type="number"
            defaultValue={b?.publication_year ?? ""}
            min={1000}
            max={2200}
          />
          <Field
            label="Edition"
            name="edition"
            defaultValue={b?.edition}
            maxLength={100}
          />
          <Field
            label="Subject"
            name="subject"
            defaultValue={b?.subject}
            maxLength={200}
          />
        </div>
        <Field label="Description" name="description">
          <textarea
            name="description"
            defaultValue={b?.description}
            maxLength={10000}
            rows={3}
          />
        </Field>
        <div className="actions">
          <button className="button" disabled={busy}>
            Save title
          </button>
          <button className="button secondary" type="button" onClick={close}>
            Close editor
          </button>
        </div>
      </form>
    </div>
  );
}
function CopyEditor({
  copy,
  data,
  busy,
  save,
  close,
}: {
  copy: Copy | "new";
  data: Workspace;
  busy: boolean;
  save: (b: Record<string, unknown>, id: string | null) => void;
  close: () => void;
}) {
  const c = typeof copy === "string" ? null : copy;
  return (
    <div className="panel editor">
      <h2>{c ? "Edit physical copy" : "Add physical copy"}</h2>
      <form
        onSubmit={submit(async (d) =>
          save(Object.fromEntries(d), c?.id ?? null),
        )}
      >
        <Field label="Bibliographic title" name="book_id">
          <select
            name="book_id"
            defaultValue={c?.book_id || ""}
            required
            aria-readonly={!!c}
          >
            {c ? (
              <option value={c.book_id}>
                {data.books.find((b) => b.id === c.book_id)?.title}
              </option>
            ) : (
              <>
                <option value="" disabled>
                  Select a title
                </option>
                {data.books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} · {b.authors} · {b.edition}
                  </option>
                ))}
              </>
            )}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Exact accession number" name="accession_number">
            <input
              name="accession_number"
              defaultValue={c?.accession_number}
              readOnly={!!c}
              required
              maxLength={100}
            />
          </Field>
          <Field
            label="Shelf location"
            name="shelf_location"
            defaultValue={c?.shelf_location}
            maxLength={200}
          />
          <Field label="Physical condition" name="physical_condition">
            <select
              name="physical_condition"
              defaultValue={c?.physical_condition || "good"}
            >
              {["good", "worn", "damaged"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Inventory status" name="inventory_status">
            <select
              name="inventory_status"
              defaultValue={c?.inventory_status || "active"}
            >
              {["active", "withdrawn", "missing", "lost"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Acquired date"
            name="acquired_at"
            type="date"
            defaultValue={c?.acquired_at ?? ""}
          />
        </div>
        <div className="actions">
          <button className="button" disabled={busy}>
            Save physical copy
          </button>
          <button className="button secondary" type="button" onClick={close}>
            Close editor
          </button>
        </div>
      </form>
    </div>
  );
}
