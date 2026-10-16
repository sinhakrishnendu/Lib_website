export type Profile = {
  id: string;
  full_name: string;
  student_id: string;
  academic_programme: string;
  department: string;
  email: string;
  account_status: "pending" | "approved" | "rejected" | "suspended";
  created_at: string;
};
export type StaffRole = "admin" | "librarian" | null;
export type Book = {
  id: string;
  title: string;
  authors: string;
  isbn: string;
  publisher: string;
  publication_year: number | null;
  edition: string;
  subject: string;
  description: string;
};
export type Copy = {
  id: string;
  book_id: string;
  accession_number: string;
  shelf_location: string;
  physical_condition: string;
  inventory_status: string;
  acquired_at: string | null;
};
export type CatalogueItem = Omit<Book, "id"> & {
  book_id: string;
  copy_id: string;
  accession_number: string;
  shelf_location: string;
  available: boolean;
};
export type Request = {
  id: string;
  user_id: string;
  copy_id: string;
  status: string;
  requested_at: string;
  expires_at: string | null;
  review_note: string;
};
export type Loan = {
  id: string;
  user_id: string;
  copy_id: string;
  request_id: string | null;
  checkout_at: string;
  due_at: string;
  returned_at: string | null;
};
export type Settings = {
  max_active_loans: number;
  loan_days: number;
  reservation_hours: number;
  max_active_requests: number;
};
export type Audit = {
  id: number;
  actor_id: string | null;
  operation: string;
  entity_type: string;
  entity_id: string;
  event_time: string;
  details: unknown;
};
export function effectiveStatus(r: Request, now = Date.now()) {
  return r.status === "approved" &&
    r.expires_at &&
    Date.parse(r.expires_at) <= now
    ? "expired"
    : r.status;
}
export function isOverdue(l: Loan, now = Date.now()) {
  return !l.returned_at && Date.parse(l.due_at) < now;
}
export function date(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}
