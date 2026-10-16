# Setup, deployment and recovery

No remote project, repository or public deployment is created by this handoff. A department-controlled GitHub account and Supabase account are required. Use a separate staging project first. Service plans/quotas and Auth email delivery must be reviewed by the department before launch.

## 1. Prepare Supabase

1. Create a fresh Supabase project in the department's organisation. Record project ownership and recovery contacts privately. Use a strong database password and store it in the department's password manager.
2. In SQL Editor, run every file in `supabase/migrations/` in filename order, once each: `202610150001_library.sql`, `202610150002_student_records.sql`, then `202610160001_settings_where_clause.sql`. For a project with the first two already applied, run only the third to fix policy updates under Supabase's safe-update protection. Keep the migration history with deployment records. Never run `supabase/tests/auth-harness.sql` on a hosted project.
3. Confirm all eight public application tables show RLS enabled. Keep only `public` as the application's exposed schema; do not expose `private` or `auth`. Browser table writes intentionally have no grants.
4. Enable email/password Auth and **Confirm email**. Set a minimum password length of 12 in Auth settings. Configure department-controlled SMTP and test delivery; do not assume the platform's development mail service can serve all students. Configure appropriate rate limits/CAPTCHA in Supabase before broad registration if needed.
5. Set Auth **Site URL** to the final site root, including the repository path, for example `https://ACCOUNT.github.io/REPOSITORY/`. Add that exact root and `http://127.0.0.1:5173/` to allowed redirect URLs. During staging allow only staging URLs. The client uses PKCE callbacks at the root; hash routes are client navigation. Reset-password recovery opens `#/password` when Auth emits its recovery event.
6. Copy the project URL and **public anon key or publishable key**. Do not copy the service-role key or `sb_secret_` key.

For CLI-managed environments, use your installed Supabase CLI with `supabase init`, link the intended staging project and `supabase db push`, reviewing the target before applying. SQL Editor setup above needs no local Docker. This repository deliberately does not contain a seed file.

## 2. Configure and bootstrap

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY; use VITE_BASE_PATH=/ locally.
pnpm dev
```

1. Register the future administrator using the application's student registration form, filling in accurate staff identity information (a staff identifier may be used in the ID field). Verify the email through the received link.
2. In Supabase **Auth → Users**, independently verify the account and copy its UUID. In `supabase/bootstrap-admin.sql`, replace `REPLACE_WITH_VERIFIED_AUTH_USER_UUID` with that UUID. Run the edited script in SQL Editor as database owner. Do not commit the edited personal copy. The script refuses to replace an existing administrator.
3. Sign in again or reload. Open **Admin → Staff access** and **Admin → Policies**. Register/verify a second administrator and appoint them before relying on the system operationally. Test staff revocation from a second session.
4. Defaults are provisional: set the department's approved loan/reservation/request policy.
5. Register two staging students with controlled email addresses. Approve one; leave one pending. Verify the full acceptance checklist below before using real student data.

If an administrator's account is irrecoverable, an authorised project/database owner may grant a replacement through SQL Editor after identity verification and log the intervention. The public app never provides an unauthenticated recovery route. Existing Auth accounts do not automatically acquire profiles; this project expects registration after migrations on a fresh project. Do not apply blindly to a project with pre-existing users or other application tables.

## 3. Create a GitHub repository and Pages site

Use a department-owned repository. Decide repository visibility according to institutional policy; deployed static assets are public when using public Pages. Public configuration is safe only because database access is restricted.

```sh
# The local repository may already have been initialised during implementation.
git status
git add .
git commit -m "Implement departmental library system"
# After creating the intended empty repository in GitHub:
git remote add origin https://github.com/ACCOUNT/REPOSITORY.git
git push -u origin main
```

In **Settings → Secrets and variables → Actions → Variables**, add:

- `VITE_SUPABASE_URL`: the public project URL.
- `VITE_SUPABASE_ANON_KEY`: the public anon/publishable key.
- `VITE_BASE_PATH`: `/REPOSITORY/`. The workflow defaults to the actual repository name. Use `/` for `ACCOUNT.github.io` repositories or a custom domain served at the root.

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Enable required repository Actions permissions. Protect `main` and require **Validate library** checks before merging. The CI workflow runs unit/database/build/browser checks; the deploy workflow repeats unit/database/build checks and deploys only when manually triggered under **Actions → Deploy library to GitHub Pages → Run workflow**. Its environment can require a departmental reviewer. No push automatically publishes.

Use Node 24 / pnpm 11.25.0 in development and CI. The lockfile pins the installed dependency versions. Test tools include platform-specific embedded PostgreSQL; its approved install script hydrates bundled binary symlinks, and esbuild's installs its binary. These are local test/build dependencies, not services or production packages.

Hash routes preserve deep links under the repository prefix: `https://ACCOUNT.github.io/REPOSITORY/#/student/requests`. Static asset URLs use Vite's configured base. See [Vite Pages instructions](https://vite.dev/guide/static-deploy.html#github-pages).

## 4. Production acceptance checklist

- [ ] All migrations applied to the intended project; no fictional test data imported.
- [ ] All eight application tables use RLS and direct browser writes are denied.
- [ ] Public catalogue response contains no profiles, borrowers, loans, request history or administrative fields.
- [ ] Pending and email-unverified users cannot request; approved students can see only their own records.
- [ ] A student cannot appoint staff or call checkout/check-in/policy RPCs.
- [ ] Two staff sessions racing for the same copy produce one reservation/loan; failed action has a meaningful error.
- [ ] Confirm email, login, logout and password recovery work on the final repository URL, including mobile.
- [ ] Staff can issue, adjust due date and receive a real test copy; damaged return stays unavailable. Remove staging records by discarding the staging project, not seeding production.
- [ ] CSV preview, conflicting duplicate rejection, identical re-import, exports and leading-zero preservation verified.
- [ ] Administrator succession, staff removal and policy decisions reviewed.
- [ ] Staging restore rehearsal completed; backups stored in restricted storage; departmental operator identified.
- [ ] CI passes, current dependencies reviewed, final GitHub Pages URL loads assets and direct hash links.

## 5. Backups and restore

Daily/weekly schedules and retention must be chosen by the department. Before migrations or major imports, take a full backup. **Reports → Exact catalogue JSON** preserves catalogue strings and UUIDs; CSV exports are useful for review. Neither includes Auth accounts, all policies or audit data, so neither is a full-system recovery image.

An authorised Supabase project owner should use the platform's supported backup/restore facilities for that project's plan or a documented PostgreSQL logical backup process that includes application schemas/data, roles/grants/functions and Auth data. Consult [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups) and [migration/restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase). Managed Auth schemas and Supabase ownership rules require provider-specific restore steps; do not blindly restore a whole cluster dump into another managed project.

For a self-managed/disposable PostgreSQL staging instance, the standard owner-operated pattern is:

```sh
# DATABASE_URL is supplied from a password manager in the operator's environment.
pg_dump --format=custom --file=library.backup "$DATABASE_URL"
pg_restore --list library.backup
# Restore into an EMPTY disposable target first, never overwrite live data blindly.
pg_restore --exit-on-error --no-owner --dbname="$RESTORE_DATABASE_URL" library.backup
```

Do not put URLs/passwords directly in tracked scripts or command history. Encrypt dumps at rest. A technical owner must adapt and rehearse these commands for hosted Supabase using its official migration procedure; the local PostgreSQL test runner is not a restore target for real student data.

Recovery rehearsal:

1. Stop circulation writes during the recovery window and record the last known checkout/check-in/import.
2. Create an isolated target; restore using the provider-supported procedure. Restore Auth users/identifiers consistently before FK-dependent profiles/loans; ensure Auth configuration and SMTP are recreated securely.
3. Verify table counts, exact accessions, active-loan uniqueness, staff assignments, RLS, RPC execution grants and audits. Run staging acceptance with controlled accounts; do not email all restored users automatically.
4. Reconcile physical books and transactions after the backup timestamp. Obtain the operational owner's approval before switching the deployed public URL/key to the restored project and rebuilding.
5. Invalidate old sessions if appropriate; document data loss interval, backup provenance, operator and restore results. Resume circulation only after reconciliation.

Catalogue-only transfer from JSON requires a trusted technical operator to preserve `books.id` and `book_copies.id` while loading into an empty migration-compatible database, or convert it to import rows with book IDs remapped deliberately. There is no generic full-system JSON restore button. Original accession values must be kept as text. Keep the original JSON before spreadsheet processing.

## 6. Transfer administration

Create and verify the incoming administrator, appoint them while the outgoing admin still has access, and test their policy/role pages. Transfer department-owned GitHub/Supabase/SMTP/password-manager ownership and recovery details outside the application. Export and verify a backup, reconcile outstanding loans and reservations, then revoke the outgoing staff role and invalidate their Auth sessions. Preserve history and audit trails; do not delete past users. Record the handover date and responsible people privately.
