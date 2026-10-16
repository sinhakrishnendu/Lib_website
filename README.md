# Zoology Department Library Management System

A departmental library application for the Department of Zoology, Siksha-Bhavana, Visva-Bharati, Santiniketan, West Bengal, India. React, TypeScript and Tailwind run as a static GitHub Pages site. Supabase Auth and PostgreSQL provide identity, private records and transactional circulation. There is no application server to maintain.

The repository includes the application, database migrations, security and concurrency tests, CSV tools, deployment workflows and operating guides. No departmental holdings, invented contacts, logos or production users are included. Connecting a Supabase project is required for live operation. Without configuration, the app explicitly shows setup status.

## Run locally

Use Node.js 24 and pnpm 11.25.0 (install pnpm via Corepack or its official installer).

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Edit .env with your project's URL and PUBLIC anon/publishable key.
pnpm dev
```

Open the printed localhost URL. Read [DEPLOYMENT.md](DEPLOYMENT.md) before connecting a production database. Never put a service-role key, secret key, database password or personal access token in a `VITE_` variable.

## Implemented features

- Public searchable and paginated catalogue, author/subject/availability filters, copy details and exact accession strings.
- Supabase email/password registration, email verification, password reset and separate librarian membership approval.
- Student dashboard, requests and cancellation, active loans, history, and profile editing with renewed approval after identity changes.
- Librarian membership decisions, request decisions, expiring reservations, verified physical checkout/check-in, due-date updates, and overdue views.
- Bibliographic titles separate from accessioned copies; copy conditions, withdrawal/missing/lost statuses; immutable accession numbers.
- CSV template, preview, rejected-row download, atomic/repeat-safe import, catalogue and circulation exports, exact JSON catalogue export.
- Administrator staff appointments/revocations, borrowing policies, last-administrator protection, and audit history.
- RLS on every application table, no direct browser writes, explicit public projection, audited database RPCs, serialized circulation and unique indexes.
- Responsive layouts, accessible input labels, confirmations, notifications, loading/error/empty states, hash routes for GitHub Pages subpaths.

## First operational day

1. Follow [DEPLOYMENT.md](DEPLOYMENT.md): create Supabase, apply all SQL migrations in filename order, configure Auth, register/verify the first administrator and run `supabase/bootstrap-admin.sql` with that account's actual UUID.
2. Sign in, open **Admin → Policies**, and confirm the department's borrowing limits and deadlines. Defaults are 3 simultaneous loans/reservations, 14-day loans, 48-hour reservations and 5 open requests.
3. Ask future librarians to register and verify their accounts. Independently verify their identity, then appoint them under **Admin → Staff access**.
4. Open **Librarian → Catalogue → Add title**, save bibliographic details, then **Add physical copy** for each accession. Alternatively use **CSV import → Download empty template**, enter real records, preview, correct invalid rows and commit the valid batch.
5. Students register and verify their email. Compare their details with departmental records under **Librarian → Memberships**, then approve. Email verification alone grants no borrowing access.
6. Approve student book requests; verify both identity and accession at collection; record checkout. Inspect and record each physical return.

## Checks

```sh
pnpm test          # unit and component tests
pnpm test:db       # disposable real PostgreSQL; RLS and independent-connection races
pnpm build        # TypeScript and production assets
VITE_BASE_PATH=/Lib_website/ pnpm build
pnpm test:pages   # test built files under that repository path
pnpm exec playwright install chromium
PLAYWRIGHT_CHANNEL=chromium pnpm test:e2e
```

Browser tests use clearly fictional HTTP fixtures; database tests apply the actual production migrations to real PostgreSQL with a minimal test Auth schema. These do not replace a final staging Supabase email/Auth check. See [TESTING.md](TESTING.md) for scope and recorded outcomes.

## Repository map

```text
.github/workflows/     CI checks and manually triggered Pages deployment
src/
  App.tsx              Routes, role gates, navigation
  components/          Public, student, librarian, administrator interfaces
  lib/                 Auth, Supabase queries, CSV validation, shared types
  styles.css           Responsive academic visual design
supabase/
  migrations/          Ordered production schema, RPCs and RLS
  tests/               Minimal Auth harness for disposable PostgreSQL only
  bootstrap-admin.sql  Owner-operated, first-administrator bootstrap
scripts/test-db.mjs    Real database integration and concurrency suite
tests/                 Vitest component/unit and Playwright browser tests
public/                Empty catalogue CSV template
.env.example           Public configuration example
pnpm-lock.yaml         Reproducible dependencies
```

Read [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), [SECURITY.md](SECURITY.md), [LIBRARIAN_GUIDE.md](LIBRARIAN_GUIDE.md), [STUDENT_GUIDE.md](STUDENT_GUIDE.md), [TESTING.md](TESTING.md), and [CHANGELOG.md](CHANGELOG.md).

## Operating limits

This MVP targets a small department. Staff screens load operational datasets in 1,000-row pages, then filter locally; large institutions should add server-side filtered reports. No automatic email notifications, fines, renewals, barcodes, offline circulation, or overdue scheduler are provided. Reservations expire logically by timestamp, so no scheduler is required. Raw Auth delivery and hosted Supabase APIs require a department-managed project, SMTP configuration and a staging check. Remote accounts and deployment have not been created.
