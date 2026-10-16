import { describe, it, expect } from "vitest";
import { headers, parseCatalogue, toCsv } from "../src/lib/csv";
import {
  effectiveStatus,
  isOverdue,
  type Loan,
  type Request,
} from "../src/lib/types";
describe("CSV validation", () => {
  it("has a physical-copy template", () => {
    expect(headers).toContain("accession_number");
    expect(headers).toContain("book_id");
  });
  it("preserves accession zeroes and whitespace exactly", () => {
    const r = parseCatalogue(
      'title,authors,accession_number\nTest,Test Author,000001\nTest,Test Author," 00-A "',
    );
    expect(r.map((r) => r.data.accession_number)).toEqual(["000001", " 00-A "]);
    expect(r.every((r) => !r.errors.length)).toBe(true);
  });
  it("handles quoted commas and multiline values", () => {
    const r = parseCatalogue(
      'title,authors,accession_number\n"Test, book","Test\nAuthor",0001',
    );
    expect(r[0].data.title).toBe("Test, book");
    expect(r[0].data.authors).toBe("Test\nAuthor");
  });
  it("requires title authors accession headers and values", () => {
    expect(parseCatalogue("title,other\nTest,x")[0].errors.join(" ")).toContain(
      "Missing columns",
    );
    expect(
      parseCatalogue("title,authors,accession_number\nTest,,0001")[0].errors,
    ).toContain("authors is required");
  });
  it("rejects unknown and duplicate columns", () => {
    expect(
      parseCatalogue("title,authors,accession_number,extra\nTest,Author,A,x")[0]
        .errors,
    ).toContain("Unknown CSV column; use the template");
    expect(
      parseCatalogue(
        "title,authors,accession_number,title\nTest,Author,A,Other",
      )[0].errors,
    ).toContain("Unknown CSV column; use the template");
  });
  it("reports duplicates rather than silently dropping rows", () => {
    expect(
      parseCatalogue(
        "title,authors,accession_number\nTest,Test,A\nTest,Test,A",
      )[1].errors,
    ).toContain("Duplicate accession number in file");
  });
  it("validates years conditions statuses UUIDs and dates", () => {
    const r = parseCatalogue(
      "title,authors,accession_number,publication_year,physical_condition,inventory_status,acquired_at,book_id\nTest,Author,A,23,bad,available,2026-02-30,not-a-uuid",
    );
    expect(r[0].errors).toHaveLength(5);
  });
  it("limits lengths and batch size", () => {
    expect(
      parseCatalogue(
        `title,authors,accession_number\n${"x".repeat(501)},Test,A`,
      )[0].errors.join(" "),
    ).toContain("exceeds");
    expect(() =>
      parseCatalogue(
        "title,authors,accession_number\n" +
          Array.from({ length: 501 }, (_, i) => `Test,Test,${i}`).join("\n"),
      ),
    ).toThrow("500");
  });
  it("rejects empty files", () =>
    expect(() => parseCatalogue("title,authors,accession_number\n")).toThrow(
      "no records",
    ));
  it("exports spreadsheet-safe CSV and retains exact JSON-compatible strings", () => {
    const csv = toCsv([{ accession_number: "0001", title: "=1+1" }]);
    expect(csv).toContain('"0001"');
    expect(csv).toContain("'=1+1");
  });
});
describe("circulation display rules", () => {
  it("shows elapsed reservations as expired without waiting for cleanup", () =>
    expect(
      effectiveStatus(
        { status: "approved", expires_at: "2026-01-01T00:00:00Z" } as Request,
        Date.parse("2026-01-02"),
      ),
    ).toBe("expired"));
  it("does not turn fulfilled requests into expired requests", () =>
    expect(
      effectiveStatus(
        { status: "fulfilled", expires_at: "2026-01-01T00:00:00Z" } as Request,
        Date.parse("2026-01-02"),
      ),
    ).toBe("fulfilled"));
  it("detects overdue active loans and excludes returned loans", () => {
    const l = { due_at: "2026-01-01T00:00:00Z", returned_at: null } as Loan;
    expect(isOverdue(l, Date.parse("2026-01-02"))).toBe(true);
    expect(
      isOverdue({ ...l, returned_at: "2026-01-01" }, Date.parse("2026-01-02")),
    ).toBe(false);
  });
});
