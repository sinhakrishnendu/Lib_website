import Papa from "papaparse";
export const headers = [
  "book_id",
  "title",
  "authors",
  "isbn",
  "publisher",
  "publication_year",
  "edition",
  "subject",
  "description",
  "accession_number",
  "shelf_location",
  "physical_condition",
  "inventory_status",
  "acquired_at",
] as const;
export type ImportRow = Record<string, string>;
export type PreviewRow = { line: number; data: ImportRow; errors: string[] };
export const maxCsvBytes = 2 * 1024 * 1024;
export function parseCatalogue(text: string): PreviewRow[] {
  const parsed = Papa.parse<ImportRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });
  const fields = parsed.meta.fields ?? [];
  const missing = ["title", "authors", "accession_number"].filter(
    (f) => !fields.includes(f),
  );
  const seen = new Set<string>();
  const result = parsed.data.map((raw, index) => {
    const data: ImportRow = {};
    headers.forEach((h) => (data[h] = raw[h] ?? ""));
    data.title = data.title.trim();
    data.authors = data.authors.trim();
    data.physical_condition ||= "good";
    data.inventory_status ||= "active";
    const errors: string[] = [];
    if (missing.length) errors.push(`Missing columns: ${missing.join(", ")}`);
    if (fields.some((f) => !headers.includes(f as (typeof headers)[number])))
      errors.push("Unknown CSV column; use the template");
    for (const key of ["title", "authors", "accession_number"])
      if (!data[key].trim()) errors.push(`${key} is required`);
    for (const [key, max] of Object.entries({
      title: 500,
      authors: 500,
      isbn: 32,
      publisher: 300,
      edition: 100,
      subject: 200,
      description: 10000,
      accession_number: 100,
      shelf_location: 200,
    }))
      if (data[key].length > max)
        errors.push(`${key} exceeds ${max} characters`);
    if (seen.has(data.accession_number))
      errors.push("Duplicate accession number in file");
    seen.add(data.accession_number);
    if (
      data.book_id &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        data.book_id,
      )
    )
      errors.push("Invalid book_id UUID");
    if (
      data.publication_year &&
      (!/^\d{4}$/.test(data.publication_year) ||
        +data.publication_year < 1000 ||
        +data.publication_year > 2200)
    )
      errors.push("publication_year must be between 1000 and 2200");
    if (!["good", "worn", "damaged"].includes(data.physical_condition))
      errors.push("Invalid physical_condition");
    if (
      !["active", "withdrawn", "missing", "lost"].includes(
        data.inventory_status,
      )
    )
      errors.push("Invalid inventory_status");
    if (
      data.acquired_at &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(data.acquired_at) ||
        !Number.isFinite(Date.parse(data.acquired_at)) ||
        new Date(data.acquired_at).toISOString().slice(0, 10) !==
          data.acquired_at)
    )
      errors.push("acquired_at must be a valid YYYY-MM-DD date");
    for (const err of parsed.errors)
      if (err.row === index || err.row === undefined) errors.push(err.message);
    return { line: index + 2, data, errors };
  });
  if (!result.length) throw new Error("The CSV contains no records.");
  if (result.length > 500)
    throw new Error("Use at most 500 copies per import. Split larger files.");
  return result;
}
export function toCsv(
  data: Record<string, unknown>[],
  columns?: string[],
  spreadsheetSafe = true,
) {
  return Papa.unparse(data, {
    columns,
    escapeFormulae: spreadsheetSafe,
    quotes: true,
    newline: "\r\n",
  });
}
export function download(
  name: string,
  text: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function template() {
  download("catalogue-template.csv", headers.join(",") + "\r\n");
}
