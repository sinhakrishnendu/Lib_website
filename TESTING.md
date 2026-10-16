# Testing and verification

## Policy-update fix — 16 October 2026

Executed `node scripts/test-db.mjs` after adding `202610160001_settings_where_clause.sql`: **35 database integration/security tests passed**. The new test verifies saved policy values, audit details and rollback of an invalid policy; administrator-only access remains covered. The local PostgreSQL test cluster does not load Supabase's safeupdate extension. Apply the new migration to the hosted project, then retry the policy form to verify that environment's protection accepts the explicitly filtered update.

## Recorded local results — 15 October 2026

All tests below were executed locally on macOS ARM64 with Node 24.19.0. No hosted Supabase credentials were provided. No remote deployment was performed.

| Check                                      | Outcome                                                                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Vitest unit/component suite                | 18 passed, 3 files                                                                                                                 |
| Real PostgreSQL integration/security suite | 34 passed; production migrations applied to a fresh disposable PostgreSQL 18.1 cluster                                             |
| Playwright acceptance suite                | 26 passed; 13 scenarios on desktop and mobile, served beneath `/library-tests/`                                                    |
| TypeScript                                 | `tsc -b` passed                                                                                                                    |
| Production build                           | Vite build passed using `/Lib_website/` as base; main JavaScript about 350 KB / 109 KB gzip                                        |
| Built-site browser smoke checks            | Desktop and mobile passed: prefixed assets, catalogue deep link, private-route redirect, responsive width and no JavaScript errors |

Executed entry commands (the bundled Node executable was put on PATH; direct entries avoid the host's absent npm command):

```sh
node node_modules/vitest/vitest.mjs run
node scripts/test-db.mjs
node node_modules/typescript/bin/tsc -b
VITE_BASE_PATH=/Lib_website/ node node_modules/vite/bin/vite.js build
node scripts/test-pages.mjs
node node_modules/@playwright/test/cli.js test
```

The package scripts below run these same tools. PostgreSQL and browser/server processes require a host that permits local process execution and loopback sockets. This desktop environment required execution outside its restricted command sandbox for those checks. No test was counted as passed from a restricted or incomplete run.

## Reproduce

Use Node 24 and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm test:db
pnpm build
pnpm exec playwright install chromium
PLAYWRIGHT_CHANNEL=chromium pnpm test:e2e
VITE_BASE_PATH=/Lib_website/ pnpm build
PLAYWRIGHT_CHANNEL=chromium PAGES_BASE_PATH=/Lib_website/ pnpm test:pages
```

Local browser tests default to an installed Google Chrome. Set `PLAYWRIGHT_CHANNEL=chromium` to use the downloaded Playwright browser. The real PostgreSQL test dependency includes its native platform binary and approved postinstall symlink setup. It uses a temporary directory, random loopback port and ephemeral test-only credentials, then stops the owned database and removes its test data. Never supply production connection information to this runner. On Linux, run as a normal user; the runner does not create operating-system accounts.

## Coverage and trust boundaries

**Unit/component tests:** CSV required fields, unknown/duplicate headers, quoted/multiline values, duplicate accessions, length/year/UUID/date/status validation, file batch limits, exact leading-zero/whitespace strings, formula-safe exports, reservation expiry and overdue calculations; registration metadata and verification messages; catalogue query and display. Configuration tests accept public keys and reject malformed, service-role and secret keys, incomplete settings and insecure remote URLs.

**Database tests:** apply every production migration in filename order, with actual PostgreSQL roles and RLS. The test harness provides only the Auth table fields used by application SQL and a JWT-subject helper. Sessions authenticate as an owner solely to `SET LOCAL ROLE` and an explicit fictional test subject, simulating the identity already validated by Supabase Auth/PostgREST. The exercised SQL is the production implementation, not a mocked database.

The suite tests metadata-based escalation, pending and unverified borrowers, anonymous private access, ownership of private profiles/requests/loans, cancellation ownership, denied direct writes, staff-only mutations, role grants/revocation, last-admin protection, librarian audit/policy restrictions, exact/duplicate accessions, search, checkout/check-in, due dates/overdue queries, damaged/unavailable inventory, expired reservations, rejection notes, profile reapproval, atomic/repeat-safe CSV imports and active request/borrowing limits.

Race tests use independent PostgreSQL connections and overlapping requests for approvals, checkouts, check-ins and request limits. They assert exactly one success and the final database state. They are not Promise-only mocks or a single in-memory transaction queue. The suite also verifies that all eight application tables have RLS and that anonymous callers cannot execute private helpers.

**Browser tests:** use the real built interface in Chrome with deterministic fictional Supabase HTTP fixtures. These exercise browser routing, session-dependent controls, form submission, membership gating, accession display, request submission/cancellation, privacy page gates, staff request approval/rejection, physical checkout/check-in, administrator confirmations, invalid/valid CSV previews, downloads and import results. They assert the actual RPC names and payloads sent by the UI. They do not establish hosted Auth delivery or server authorization; those are separately covered by database tests and required staging checks.

**Built production smoke tests:** a test-only static server emulates GitHub Pages' repository subdirectory and serves `dist`. Desktop/mobile browser sessions verify emitted asset URLs, direct hash links, private-route redirect, width overflow and uncaught exceptions. There is no production custom backend. Screenshots are written to ignored `artifacts/production-desktop.png` and `artifacts/production-mobile.png`.

## CI and staging

`.github/workflows/ci.yml` installs the frozen lockfile, runs unit/database tests, compiles the production site under a test repository prefix, installs Chromium, checks built assets and runs browser acceptance tests. Failed browser traces are retained as CI artifacts. The manually triggered Pages workflow repeats unit/database/build checks and requires configured public Supabase values. Protect the branch and require CI before deployment.

Before accepting real users, complete the production checklist in [DEPLOYMENT.md](DEPLOYMENT.md) on a separate real Supabase staging project: live registration, confirmation delivery, PKCE callback and password recovery on the final URL, login/logout, raw API access attempts with student/anonymous credentials, two simultaneous real staff sessions, report export and a backup/restore rehearsal. The local Auth harness does not test GoTrue, SMTP, JWT validation or the hosted PostgREST layer. Do not describe those external integrations or an unperformed restore rehearsal as verified.

No automated WCAG audit or large-catalogue load benchmark was executed. The interface includes labels, semantic headings, skip navigation, keyboard focus indicators, native modal confirmations, mobile layouts and reduced-motion support; visual review and functional desktop/mobile testing were completed. Reservation expiry is logical and lazy, not a scheduled-job test.
