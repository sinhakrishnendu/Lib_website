# Database schema and API

Apply migrations in filename order. They require a fresh Supabase project with `auth.users`, `auth.uid()`, `anon` and `authenticated`. Do not run the test Auth harness on Supabase.

| Table             | Purpose and important constraints                                                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `books`           | UUID title, authors, ISBN, publisher, year, edition, subject and description. Required title/authors, bounded lengths/year; ISBN deliberately not unique.                                                                                                 |
| `book_copies`     | UUID, required book FK, unique required exact text accession, shelf, condition, inventory status, acquisition date and timestamps. Accession immutable through supported RPCs.                                                                            |
| `profiles`        | Auth user UUID PK/FK, identity/programme/department/email snapshot, controlled membership status and timestamps. Auth trigger ignores user-provided role/status.                                                                                          |
| `staff_roles`     | One staff role per profile: `admin` or `librarian`; granting actor/time. Separate from membership status.                                                                                                                                                 |
| `book_requests`   | Borrower/copy FK, state and decision metadata, optional expiry and bounded note. Unique active user/copy pair and approved copy.                                                                                                                          |
| `loans`           | Borrower/copy FK, optional unique request FK, issue/due/return times and issuing/receiving staff FKs. Composite request FK also matches borrower and copy. One active loan per copy; due later than issue; return and receiving actor nullability paired. |
| `system_settings` | One singleton row, maximum loans, loan days, reservation hours and request limit with bounded positive values.                                                                                                                                            |
| `audit_events`    | Identity PK, actor FK, operation, entity table/ID, event time and before/after JSON. No application mutation grant.                                                                                                                                       |

All eight tables have RLS. Indexes cover book/copy joins, title text search, membership queues, request owner/queue, active overdue loans, student loans and audit time. Public substring catalogue search also covers accession/ISBN and supports bounded limit/offset. The full-text index is available for future ranking; the current user-facing substring query prioritizes predictable exact fragments.

## Enumerated values

- Membership: `pending`, `approved`, `rejected`, `suspended`.
- Request: `pending`, `approved`, `rejected`, `cancelled`, `expired`, `fulfilled`.
- Condition: `good`, `worn`, `damaged`.
- Inventory: `active`, `withdrawn`, `missing`, `lost`.

Availability is calculated from condition/inventory, loans and reservation deadline. It is never stored independently. Acquisition dates are date-only; circulation times are `timestamptz`, stored as instants and shown in the operator's browser timezone. SQL defaults use transaction time. Accession values are never trimmed or converted to numbers. Blank-only accession strings are rejected; leading/trailing spaces on nonblank values are retained and distinguish records.

## Public RPCs

`catalogue(p_query, p_author, p_subject, p_available, p_book_id, p_limit, p_offset)` returns `{ total, items }`. Items contain only book UUID/title/authors/ISBN/publisher/year/edition/subject/description and copy UUID/accession/shelf/availability. Limit is clamped to 1–100; default 24. Neither profile fields nor request/loan counts, IDs or timelines are returned.

## Signed-in RPCs

All parameters use the `p_` prefix; SQL files define exact signatures.

| Function                               | Permission / effect                                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `my_circulation()`                     | Own requests and loans with title, accession and book UUID.                                                                                                 |
| `update_my_profile(...)`               | Own identity; any changed identity resets approval to pending. Cannot change email, role or status directly.                                                |
| `submit_request(copy)`                 | Current approved, email-verified borrower; available copy and request/loan limits.                                                                          |
| `cancel_request(request)`              | Own pending/approved request only.                                                                                                                          |
| `review_member(user,status)`           | Staff; approve/reject/suspend another account; restrictions cancel open requests.                                                                           |
| `review_request(request,approve,note)` | Staff; pending request; approval validates copy, borrower and limits.                                                                                       |
| `checkout(copy,user,request?,due?)`    | Staff; verified handover; transaction creates loan and resolves requests.                                                                                   |
| `checkin(loan,condition)`              | Staff; active loan; records return and condition.                                                                                                           |
| `change_due_date(loan,due)`            | Staff; active loan and future due within 365 days.                                                                                                          |
| `save_book(book,id?)`                  | Staff; insert or edit title metadata.                                                                                                                       |
| `save_copy(copy,id?)`                  | Staff; insert or edit physical inventory; cannot mutate accession/reparent existing copy. Restricted inventory changes require return/released reservation. |
| `import_catalogue(rows)`               | Staff; 1–500 copy rows atomically; identical existing rows skipped, conflicting ones rejected; returns added/skipped counts.                                |
| `set_staff_role(user,role?)`           | Admin only; null revokes; last admin cannot be removed.                                                                                                     |
| `update_settings(...)`                 | Admin only; constraints validate every value.                                                                                                               |

Private helpers have no public execute grant except the role predicate needed by authenticated RLS. Trigger functions create profiles, update timestamps and append audited changes. The migration revokes default PUBLIC function execution and explicitly grants supported functions. No API role can write directly to application tables, including audit events.

## Policy defaults

Three simultaneous loans including reserved copies; 14-day default loan; 48-hour reservation; five open requests. These are starting defaults for the administrator to confirm. Policy updates apply to future transactions, not existing deadlines. Staff may set/adjust due dates within 365 days. No fine policy or invented institutional lending rules are built in.
