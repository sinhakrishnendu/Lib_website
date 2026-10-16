import { test, expect, type Page } from "@playwright/test";
const ids = {
  user: "00000000-0000-4000-8000-000000000003",
  book: "00000000-0000-4000-8000-000000000010",
  copy: "00000000-0000-4000-8000-000000000011",
  req: "00000000-0000-4000-8000-000000000012",
  loan: "00000000-0000-4000-8000-000000000013",
};
const profile = {
  id: ids.user,
  full_name: "Fictional Test Student",
  student_id: "000S",
  academic_programme: "Test MSc",
  department: "Test Zoology",
  email: "test@example.invalid",
  account_status: "approved",
  created_at: new Date().toISOString(),
};
const item = {
  book_id: ids.book,
  copy_id: ids.copy,
  title: "FICTIONAL TEST · Ecology",
  authors: "Test Author",
  accession_number: "000017",
  shelf_location: "TEST-A",
  available: true,
  subject: "Ecology",
  isbn: "",
  publisher: "Test Press",
  edition: "Test",
  publication_year: 2020,
  description: "Fictional browser test fixture.",
};
const request = {
  id: ids.req,
  user_id: ids.user,
  copy_id: ids.copy,
  status: "approved",
  requested_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  review_note: "",
  title: item.title,
  accession_number: item.accession_number,
  book_id: ids.book,
};
const loan = {
  id: ids.loan,
  user_id: ids.user,
  copy_id: ids.copy,
  checkout_at: new Date().toISOString(),
  due_at: new Date(Date.now() + 86400000).toISOString(),
  returned_at: null,
  title: item.title,
  accession_number: item.accession_number,
  book_id: ids.book,
};
async function fixtures(
  page: Page,
  role?: "student" | "librarian" | "admin",
  status = "approved",
  requestStatus = "approved",
) {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  if (role)
    await page.addInitScript(
      ({ user }) => {
        const payload = btoa(
          JSON.stringify({
            sub: user,
            exp: Math.floor(Date.now() / 1000) + 3600,
            role: "authenticated",
          }),
        );
        localStorage.setItem(
          "sb-127-auth-token",
          JSON.stringify({
            access_token: `e30.${payload}.test`,
            refresh_token: "test-refresh",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: user,
              email: "test@example.invalid",
              aud: "authenticated",
              role: "authenticated",
              app_metadata: { provider: "email" },
              user_metadata: {},
            },
          }),
        );
      },
      { user: ids.user },
    );
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = [];
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
        body: "",
      });
    if (path.includes("/rpc/")) {
      const name = path.split("/").pop()!;
      calls.push({ name, body: route.request().postDataJSON() });
      body =
        name === "catalogue"
          ? { total: 1, items: [item] }
          : name === "my_circulation"
            ? { requests: [request], loans: [loan] }
            : name === "checkout"
              ? ids.loan
              : name === "import_catalogue"
                ? { added: 1, skipped: 0 }
                : null;
    } else if (path.endsWith("/profiles"))
      body = url.searchParams.get("id")
        ? { ...profile, account_status: status }
        : [{ ...profile, account_status: status }];
    else if (path.endsWith("/staff_roles"))
      body =
        role && role !== "student"
          ? url.searchParams.get("user_id")
            ? { role }
            : [
                {
                  user_id: ids.user,
                  role,
                  granted_at: new Date().toISOString(),
                },
              ]
          : url.searchParams.get("user_id")
            ? null
            : [];
    else if (path.endsWith("/books")) body = [{ ...item, id: ids.book }];
    else if (path.endsWith("/book_copies"))
      body = [
        {
          id: ids.copy,
          book_id: ids.book,
          accession_number: item.accession_number,
          shelf_location: "TEST-A",
          physical_condition: "good",
          inventory_status: "active",
        },
      ];
    else if (path.endsWith("/book_requests"))
      body = [{ ...request, status: requestStatus }];
    else if (path.endsWith("/loans")) body = [loan];
    else if (path.endsWith("/system_settings"))
      body = [
        {
          id: true,
          max_active_loans: 3,
          loan_days: 14,
          reservation_hours: 48,
          max_active_requests: 5,
        },
      ];
    else if (path.includes("/auth/v1/signup"))
      body = { user: { id: ids.user }, session: null };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "content-range",
      },
      body: JSON.stringify(body),
    });
  });
  return calls;
}
test("home is responsive and catalogue search preserves accession", async ({
  page,
}) => {
  const calls = await fixtures(page);
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: /A world of life/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/home-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "Search library catalogue" })
    .fill("000017");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("000017", { exact: true })).toBeVisible();
  expect(
    calls.some((c) => c.name === "catalogue" && c.body.p_query === "000017"),
  ).toBe(true);
  await page.getByRole("link", { name: item.title }).click();
  await expect(page.getByText("ISBN: Not recorded")).toBeVisible();
});
test("registration submits identity and requires verification", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("./#/register");
  await page.getByLabel("Full name").fill("Fictional Test Student");
  await page.getByLabel("Student ID / roll number").fill("000S");
  await page.getByLabel("Academic programme").fill("Test MSc");
  await page
    .getByLabel("Email (university email where available)")
    .fill("test@example.invalid");
  await page.getByLabel(/Password/).fill("long-test-password");
  await page.getByRole("button", { name: "Create student account" }).click();
  await expect(page.getByText(/Check your email to verify/)).toBeVisible();
});
test("pending student cannot request a copy", async ({ page }) => {
  await fixtures(page, "student", "pending");
  await page.goto("./#/catalogue");
  await expect(
    page.getByRole("button", { name: "Membership approval required" }),
  ).toBeDisabled();
});
test("student submits and cancels own request after confirmation", async ({
  page,
}) => {
  const calls = await fixtures(page, "student");
  await page.goto("./#/catalogue");
  await page.getByRole("button", { name: "Request this copy" }).click();
  await expect(page.getByRole("status")).toContainText("Request submitted");
  await page.goto("./#/student/requests");
  await page
    .getByRole("button", { name: "Cancel request", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    calls.some(
      (c) => c.name === "cancel_request" && c.body.p_request_id === ids.req,
    ),
  ).toBe(true);
});
test("student sees own active loans and is denied staff page", async ({
  page,
}) => {
  await fixtures(page, "student");
  await page.goto("./#/student/loans");
  await expect(page.getByText("000017", { exact: true })).toBeVisible();
  await page.goto("./#/staff");
  await expect(
    page.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
});
test("librarian checks in after inspecting condition and confirming", async ({
  page,
}) => {
  const calls = await fixtures(page, "librarian");
  await page.goto("./#/staff/checkin");
  await page.getByLabel("Condition on return").selectOption("damaged");
  await page.getByRole("button", { name: "Record check-in" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    calls.some(
      (c) =>
        c.name === "checkin" &&
        c.body.p_condition === "damaged" &&
        c.body.p_loan_id === ids.loan,
    ),
  ).toBe(true);
});
test("librarian checkout requires verification and passes reservation", async ({
  page,
}) => {
  const calls = await fixtures(page, "librarian");
  await page.goto("./#/staff/checkout?request=" + ids.req);
  await expect(page.getByText(/Reserved for/)).toBeVisible();
  await page.getByLabel(/I verified the student/).check();
  await page.getByRole("button", { name: "Record checkout" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    calls.some((c) => c.name === "checkout" && c.body.p_request_id === ids.req),
  ).toBe(true);
});
test("administrator updates policy only after confirmation", async ({
  page,
}) => {
  const calls = await fixtures(page, "admin");
  await page.goto("./#/admin/settings");
  await page.getByLabel("Default loan period (days)").fill("21");
  await page.getByRole("button", { name: "Review policy changes" }).click();
  expect(calls.some((c) => c.name === "update_settings")).toBe(false);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    calls.some(
      (c) => c.name === "update_settings" && c.body.p_loan_days === 21,
    ),
  ).toBe(true);
});

test("CSV preview blocks malformed data and downloads a template", async ({
  page,
}) => {
  await fixtures(page, "librarian");
  await page.goto("./#/staff/import");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download empty template" }).click();
  expect((await download).suggestedFilename()).toBe("catalogue-template.csv");
  await page.getByLabel("Choose catalogue CSV").setInputFiles({
    name: "fictional-invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "title,authors,accession_number\nFICTIONAL TEST,Test Author,00020\nFICTIONAL TEST,Test Author,00020",
    ),
  });
  await expect(page.getByText("2 rows · 1 invalid")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Commit valid batch" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Duplicate accession number in file"),
  ).toBeVisible();
});
test("unauthenticated private page redirects to login", async ({ page }) => {
  await fixtures(page);
  await page.goto("./#/student/loans");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

for (const approve of [true, false])
  test(`librarian ${approve ? "approves" : "rejects"} pending request with correct decision`, async ({
    page,
  }) => {
    const calls = await fixtures(page, "librarian", "approved", "pending");
    await page.goto("./#/staff/requests");
    await page.getByLabel("Review note").fill("Fictional test review");
    await page
      .getByRole("button", {
        name: approve ? "Approve" : "Reject",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      calls.some(
        (c) =>
          c.name === "review_request" &&
          c.body.p_approve === approve &&
          c.body.p_note === "Fictional test review",
      ),
    ).toBe(true);
  });

test("valid CSV import confirms before writing and reports added/skipped counts", async ({
  page,
}) => {
  const calls = await fixtures(page, "librarian");
  await page.goto("./#/staff/import");
  await page
    .getByLabel("Choose catalogue CSV")
    .setInputFiles({
      name: "fictional-valid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "title,authors,accession_number\nFICTIONAL TEST,Test Author,00020",
      ),
    });
  await expect(page.getByText("1 rows · 0 invalid")).toBeVisible();
  await page.getByRole("button", { name: "Commit valid batch" }).click();
  expect(calls.some((c) => c.name === "import_catalogue")).toBe(false);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByText(
      "Import completed: 1 copies added; 0 identical existing copies skipped.",
    ),
  ).toBeVisible();
  expect(calls.some((c) => c.name === "import_catalogue")).toBe(true);
});
