# Security model and operations

## Trust boundaries

A browser is untrusted. Hiding buttons is convenience only. PostgreSQL enforces membership, staff roles, copy eligibility, ownership, deadlines and borrowing limits. All application tables use RLS; clients cannot write tables directly. The only anonymous data API is the deliberately limited catalogue RPC. Private student reads are scoped to `auth.uid()`; librarians see operational records; only administrators read audit history and manage staff/policy.

Passwords live exclusively in Supabase Auth, never application tables. Registration metadata cannot grant approval or roles. Borrowing checks the live profile and Auth email-confirmation timestamp. Identity edits require renewed membership approval. No user can approve their own membership. Staff roles are separate from student membership: a pending staff membership does not itself disable their explicit staff appointment; revoke the role when removing staff.

Privileged functions use `SECURITY DEFINER` only for controlled operations, schema-qualified relations, empty search paths, explicit Auth/role checks and limited execution grants. Mutation helpers cannot be called by browser roles. SQL uses typed parameters and fixed SQL, not interpolated user SQL. SQL constraints and transaction locks supplement validation. Successful changes to membership, titles, copies, requests, loans, policies and roles append before/after audit records in the same transaction. Read-only browsing, sign-in failures and rejected RPC attempts are not recorded in application audit; use Supabase Auth/Postgres logs for these. Database owners remain trusted and can bypass RLS or alter audit history.

## Sessions and public credentials

Only the Supabase project URL and public anon/publishable key belong in frontend configuration. The `anon` name does not mean the key protects data; RLS and RPC permissions do. Never place a service-role/secret key, database URL/password, SMTP password, GitHub token or backup dump in source or a `VITE_` variable. Public keys appear in built JavaScript by design. Vite validates configuration before bundling and rejects secret/service-role or malformed keys; it never echoes a rejected key.

The client uses Supabase-managed PKCE sessions. Persistent sessions reside in browser storage. Use staff-only devices/browser profiles, sign out after shifts, lock shared terminals and do not retain sessions on public computers. The app renders record strings through React text nodes and never inserts untrusted HTML. Dependencies and deployment code must be trusted because script execution could access browser tokens.

Enable email confirmations, a minimum 12-character Auth password policy and the Auth platform's available abuse protections. Configure SMTP before opening registration to students. Use a secure production site URL and an exact allowlist of callback roots. Keep database role checks enabled even if adding MFA or external SSO later. Test any future Supabase upgrade against these migrations and tests.

## CSV handling

Files are limited to 2 MB/500 rows. Parsing preserves strings, handles quoting and flags malformed rows, invalid fields, duplicate accession numbers, unknown columns and invalid dates/lengths. UI preview detects known catalogue conflicts; the database repeats mandatory/uniqueness/metadata checks and commits or rolls back the complete batch. Failed concurrent imports never silently duplicate copies.

CSV reports escape formula-leading cells and quote values to reduce spreadsheet formula execution. Some spreadsheet applications still infer numeric types: import accession columns explicitly as Text. Escaping may prefix formula-like text with an apostrophe. For exact values use catalogue JSON or a database backup, not a report opened/re-saved in a spreadsheet. Original accession strings remain unchanged in PostgreSQL.

## Access lifecycle

- Verify an applicant's identity against departmental records before approval. Duplicate roll numbers are searchable but not hard-unique because programme/cohort formats may overlap; resolve ambiguous identity manually.
- Verify a staff member independently before granting access. Librarians cannot appoint themselves or others. The last administrator cannot be removed through the application.
- On departure, appoint and verify the replacement administrator first, then revoke the outgoing role. Suspending a student cancels open requests, but historical and active loans remain recorded for recovery.
- For compromised accounts, revoke staff access, suspend membership and invalidate sessions in Supabase Auth. Change affected secrets in provider consoles and rebuild the site if public configuration changes. Do not delete accounts with circulation history.
- Restrict repository write access: a malicious frontend deployment could steal staff sessions despite RLS.

## Backups, privacy and retention

Student identity, email, loan records and audit details are private departmental data. Limit access to authorised staff. Export reports only to restricted storage, encrypt backups, and define a departmental retention/incident policy. Reports are not a complete backup. Auth credentials/users, schema and application data require a tested database/Auth recovery procedure described in [DEPLOYMENT.md](DEPLOYMENT.md).

For suspected misuse: revoke access, preserve logs/backups, record affected time/accounts, review audit and Auth logs, restore service only after testing, and follow the institution's applicable privacy procedures. No legal compliance certification is implied.

## Verification scope

The integration suite tests anonymous/private access, cross-user reads and cancellation, direct table DML denial, metadata elevation, staff-only operations, last-admin protection, approval/email enforcement, atomic imports, unique accessions, limits and racing approval/checkout/check-in actions. It uses real PostgreSQL with a minimal Auth test surface. Hosted Auth token verification, SMTP, exact Supabase PostgREST permissions and deployment callback URLs must also pass staging acceptance before production. See [TESTING.md](TESTING.md).

Reference implementation guidance: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database function security](https://supabase.com/docs/guides/database/functions), and [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html).
