# Changelog

## 2026-10-16

- Fixed policy updates rejected by Supabase's safe-update protection: the settings RPC now explicitly filters the singleton row with `where id = true`.
- Added an upgrade migration preserving administrator checks, transaction locking, grants and audit triggers, plus database coverage for persisted policies, audit records and invalid-value rollback.

## 1.0.0 — 2026-10-15

- Created React/Vite/TypeScript/Tailwind departmental library application with responsive public, student, librarian and administrator interfaces.
- Added normalized Supabase schema, Auth registration trigger, RLS, explicit read/mutation grants, guarded RPCs, audits and first-administrator bootstrap.
- Implemented request/reservation/loan state transitions, physical checkout/check-in, overdue/due-date management, borrowing policies and transaction serialization.
- Added catalogue management, immutable exact accessions, atomic CSV imports with preview/rejected-row downloads and report/JSON exports.
- Added Vitest, real PostgreSQL permissions/concurrency tests, desktop/mobile Playwright acceptance tests, CI and manually triggered GitHub Pages deployment.
- Added deployment, security, backup/restore, student, librarian and succession guides. No live database, real holdings or public deployment created.
