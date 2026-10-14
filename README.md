# Resource Reservation Management System (RRMS)

[![CI](https://github.com/bineth-ellepola/Resource-Reservation-Management-System/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bineth-ellepola/Resource-Reservation-Management-System/actions/workflows/ci.yml)

> PrimeWave Lab — Software Engineering Internship Take-Home Project  
> **Submission deadline:** Thursday, **15 October 2026, 11:59 PM Asia/Colombo**.  
> **Scope:** Local full-stack application, source code, ER diagram, demo video, and submission links. **No deployment required or planned.**  
> **Status:** Implementation checklist / development plan. Do not describe unchecked features as implemented.

## 1. What to build

A responsive reservation system for shared meeting rooms, equipment, vehicles and labs. Authorized users see resource availability and create/cancel reservations; admins manage resources; the system **must prevent overlapping confirmed bookings, including simultaneous requests**.

### Must-have acceptance criteria

- [ ] Users can register/login or use clearly documented seeded demo accounts, log out, and access only authorized features.
- [ ] Admins can create, view, update, and deactivate resources; resource fields: name, type, location, capacity, active status.
- [ ] Users can browse/filter resources and inspect upcoming reservations/availability in a timeline or day/week list.
- [ ] Authenticated users can reserve available resources, see their bookings, and cancel their own bookings; admins can inspect all bookings.
- [ ] Start/end time validation, past-booking rejection, role checks, ownership checks, inactive-resource checks, and helpful errors work server-side.
- [ ] PostgreSQL rejects overlapping **confirmed** reservations for the same resource—even when two requests race.
- [ ] Cancelled bookings are kept for history but release the time slot.
- [ ] Dashboard shows useful numbers such as active resources, upcoming reservations and reservations by status; optional utilization calculation if time remains.
- [ ] Tests include overlap, adjacent intervals, same/different resources, cancellation reuse, race requests and access control.
- [ ] README contains real setup commands, migration/seed instructions, design rationale, tests and demo accounts; ER diagram link and recorded demo are provided.

### Explicit non-goals

No public deployment, payment system, email/SMS, notifications, approvals, multi-organization tenancy, recurring schedules, external calendar integrations, advanced analytics or complicated drag-and-drop calendar. Prefer a clear booking list/timeline over a large calendar library.

## 2. Suggested stack and decisions

| Layer | Choice | Why |
| --- | --- | --- |
| Web | Next.js App Router + TypeScript | Required, full-stack in one repository |
| UI | Tailwind CSS | Fast, responsive UI |
| DB | Local PostgreSQL 16+ | Required persistent relational storage; enforced exclusion constraint |
| DB access | Prisma ORM + **custom SQL migration** | Type-safe CRUD; raw PostgreSQL constraint for concurrency protection |
| Validation | Zod | Shared typed validation of request inputs |
| Authentication | Auth.js credentials with securely hashed passwords, or a similarly sound session-based approach | No external provider or deployment needed |
| Tests | Vitest for domain/integration tests; optional Playwright smoke test | Fast regression coverage |
| Version control | Git and GitHub | Task-ID branches, commits and PRs |

**Architecture:** Browser → Next.js pages/forms → server actions/route handlers → services (authorization and validation) → Prisma → PostgreSQL. All permissions and booking validation must execute on the server. Keep database credentials server-only.

**Important:** PostgreSQL is the authoritative conflict guard; an availability lookup before insertion is only user feedback, *not* concurrency protection. Store timestamps as timezone-aware PostgreSQL `timestamptz`; convert user-entered local times into precise instants; display according to the selected UI timezone, default `Asia/Colombo`. A `[start, end)` range allows one booking to begin exactly when another ends.

## 3. Directory layout (target, not all present initially)

```text
resource-reservation-management-system/
├── README.md
├── .env.example
├── .gitignore
├── package.json
├── prisma/
│   ├── schema.prisma
│   ├── migrations/             # includes custom EXCLUDE SQL
│   └── seed.ts
├── docs/
│   ├── ERD.md                  # link and schema explanation
│   ├── DECISIONS.md            # short ADR-style tradeoffs
│   ├── TESTING.md
│   └── DEMO_SCRIPT.md
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (app)/dashboard/
│   │   ├── (app)/resources/
│   │   ├── (app)/reservations/
│   │   └── api/               # handlers only if needed
│   ├── components/
│   ├── lib/                    # db client, auth, date helpers
│   ├── server/                 # resource and booking services
│   └── schemas/                # Zod validation
└── tests/
    ├── unit/
    └── integration/
```

## 4. First-time environment and project setup (TASK RRMS-00)

### 4.1 Tools

Install **Node.js 20.9+**, npm, Git, PostgreSQL 16+ and a code editor. Check:

```bash
node --version
npm --version
git --version
psql --version
```

If using Windows, run commands in PowerShell or Git Bash and adapt local PostgreSQL service commands to your installation. Start the local PostgreSQL service and create the database through `psql` or pgAdmin:

```sql
CREATE ROLE rrms_app WITH LOGIN PASSWORD 'replace-with-local-password';
CREATE DATABASE rrms_db OWNER rrms_app;
```

Never reuse the example password in a real environment. PostgreSQL must be running before migrations/tests. Verify via `psql` with the application connection string.

### 4.2 Create project

```bash
npx create-next-app@latest resource-reservation-management-system --typescript --tailwind --eslint --app --src-dir --use-npm --import-alias '@/*'
cd resource-reservation-management-system
npm run dev
```

Visit <http://localhost:3000>. Stop the server with Ctrl+C. Copy this README into the project root (replace the starter README).

### 4.3 Configure Git identity (your own verified GitHub account)

```bash
git config user.name "YOUR_REAL_NAME"
git config user.email "YOUR_VERIFIED_GITHUB_EMAIL"
git config --get user.name
git config --get user.email
```

Use a personal or GitHub-provided no-reply email already verified on your account. Do not forge author identities or add artificial contributors. Only your account should commit/push to this solo repository. GitHub's contributor graph is determined by commit attribution and other GitHub activity; it cannot be guaranteed merely by wording in README.

### 4.4 Git and remote setup

`create-next-app` may already initialize Git. Check with `git status`; only run `git init` if needed. Rename your base branch to `main` if appropriate.

```bash
git status
git branch -M main
git add README.md
git commit -m "docs(RRMS-00): add implementation roadmap"
```

Create an **empty** GitHub repository named `resource-reservation-management-system` under your own account, then replace the placeholder:

```bash
git remote add origin https://github.com/YOUR_USERNAME/resource-reservation-management-system.git
git push -u origin main
```

If `origin` already exists, inspect `git remote -v` rather than adding a duplicate. If `main` already has starter commits, keep them; do not rewrite them without reason.

### 4.5 Dependencies and environment (implemented in RRMS-01)

Suggested installation **after branch creation**:

```bash
npm install @prisma/client zod next-auth bcryptjs
npm install -D prisma tsx vitest @types/bcryptjs
npx prisma init --datasource-provider postgresql
```

Version-specific Prisma setup can vary; use the installed Prisma documentation and generated config rather than assuming older environment conventions. Supply `DATABASE_URL`, `AUTH_SECRET` (and other variables explicitly required by the selected Auth.js version) through `.env` or `.env.local` as appropriate to its runtime and tooling.

`.env.example` should contain **placeholders only**:

```dotenv
DATABASE_URL="postgresql://rrms_app:YOUR_PASSWORD@localhost:5432/rrms_db?schema=public"
AUTH_SECRET="REPLACE_WITH_A_LONG_RANDOM_VALUE"
```

Create a local environment file based on `.env.example` and generate an actual secret locally (e.g. `openssl rand -base64 32`). Confirm `.env`, `.env.local`, `.env.*.local`, `.next/` and `node_modules/` are ignored; **do not commit secrets**. Ensure Prisma CLI can read the environment file it is configured to use.

### 4.6 Verified local setup (RRMS-01)

Verified on Windows 11 with Node 24.18, npm 11.16 and PostgreSQL 18.6. Installed versions: Next.js 16.4, Prisma 7.10 (pinned; uses the `@prisma/adapter-pg` driver adapter), Zod 4, Vitest 5. Authentication will use `jose` (signed httpOnly session cookie) and `bcryptjs` rather than `next-auth`, whose credentials-capable v5 is still in beta.

1. Install dependencies (`postinstall` also generates the git-ignored Prisma client into `src/generated/prisma`):

   ```bash
   npm install
   ```

2. As the PostgreSQL superuser (on Windows, `psql` is in `C:\Program Files\PostgreSQL\<version>\bin` if it is not on `PATH`), create the application role and two databases. `CREATEDB` lets `prisma migrate dev` create its temporary shadow database. The role does not need superuser: `btree_gist` is a trusted extension that a database owner can create.

   ```sql
   CREATE ROLE rrms_app WITH LOGIN CREATEDB PASSWORD 'choose-a-local-password';
   CREATE DATABASE rrms_db OWNER rrms_app;    -- application / demo data
   CREATE DATABASE rrms_test OWNER rrms_app;  -- integration tests (tables get truncated)
   ```

3. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `TEST_DATABASE_URL` and `AUTH_SECRET`. Percent-encode special characters in the password (`@` becomes `%40`).

4. Verify the connection and the quality gate:

   ```bash
   npm run db:check     # prints: Connected as rrms_app to rrms_db (PostgreSQL ...)
   npm run typecheck    # next typegen && tsc --noEmit
   npm run lint
   npm test             # Vitest; uses TEST_DATABASE_URL and refuses databases not ending in _test
   npm run build
   ```

### 4.7 Continuous integration (RRMS-10)

GitHub Actions runs the quality gate in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) on every push to any branch and on every pull request into `main`. A newer push to the same branch cancels the run still in progress. The badge at the top of this README shows the latest result on `main`. It reads "no status" until the workflow has run on `main`.

**Temporary database.** The job starts a `postgres:18` service container with an empty `rrms_test` database. The container exists only for that job and is discarded afterwards. The workflow sets `DATABASE_URL` and `TEST_DATABASE_URL` to this database, because `tests/setup.ts` only accepts database names ending in `_test`. `AUTH_SECRET` is a fixed CI-only placeholder. No repository secrets are needed, and `.env` is never used in CI.

**Steps, in order (any failure stops the job):**

| # | Step | Command | Fails when |
|---|------|---------|------------|
| 1 | Install | `npm ci` (its `postinstall` runs `prisma generate`) | `package-lock.json` is out of sync with `package.json` |
| 2 | Prisma validation | `npx prisma validate` | `schema.prisma` is invalid |
| 3 | Lint | `npm run lint` | ESLint reports errors |
| 4 | Typecheck | `npm run typecheck` | TypeScript errors (route types are generated first) |
| 5 | Migrations | `npx prisma migrate deploy` | A committed migration fails to apply to a fresh database |
| 6 | Migration drift | `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | `schema.prisma` was changed without a matching committed migration |
| 7 | DB connection | `npm run db:check` | The app's Prisma client cannot reach PostgreSQL |
| 8 | Tests | `npm test` | Any Vitest test fails |
| 9 | Build | `npm run build` (Next.js build cache restored with `actions/cache`) | Production build fails |

The job runs on Node.js 24, the version used locally. The npm download cache is handled by `actions/setup-node`. The job has read-only repository permissions and a 15-minute timeout. CI only verifies the code: it does not deploy anything.

**Setup.** Nothing needs to be configured: the workflow runs automatically once `.github/workflows/ci.yml` is on GitHub. To make CI a merge requirement, open the repository's **Settings → Branches**, add a branch protection rule (or ruleset) for `main`, enable **Require status checks to pass**, and select **Lint, typecheck, migrate, test and build**.

**Running the same checks locally** against your `rrms_test` database before pushing:

```bash
npx prisma validate
npm run lint
npm run typecheck
npm test
npm run build
```

`prisma migrate deploy` and `migrate diff` act on `DATABASE_URL`. To mirror CI exactly, run them only against a disposable database whose name ends in `_test`, never against `rrms_db`.

## 5. Database design and ER diagram (TASK RRMS-02)

The recommended **three-table core** avoids unnecessary abstractions:

**User:** `id (UUID PK)`, `name`, `email (unique)`, `passwordHash`, `role (ADMIN/USER)`, `createdAt`.  
**Resource:** `id (UUID PK)`, `name`, `type (string/enum)`, `location`, `capacity (positive integer)`, `isActive (boolean)`, `createdAt`, `updatedAt`.  
**Reservation:** `id (UUID PK)`, `userId (FK User)`, `resourceId (FK Resource)`, `startAt (timestamptz)`, `endAt (timestamptz)`, `status (CONFIRMED/CANCELLED)`, `purpose (optional)`, `createdAt`, `updatedAt`.

Relationships: User **1:N** Reservation; Resource **1:N** Reservation. No ResourceType table is necessary for MVP: a resource type field is sufficient.

### 5.1 Critical PostgreSQL overlap constraint

After creating the reservation table in a Prisma migration, **edit the generated SQL migration** (before applying it) to include the following, adjusting actual quoted table/column/enum names to match generated SQL:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation"
  ADD CONSTRAINT reservation_valid_time
  CHECK ("endAt" > "startAt");

ALTER TABLE "Reservation"
  ADD CONSTRAINT reservation_no_confirmed_overlap
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" = 'CONFIRMED');
```

**Check the generated Prisma schema/SQL for the actual status storage format** (e.g. PostgreSQL enum) and adjust the predicate accordingly. `btree_gist` makes equality on a UUID resource ID available to GiST. The partial constraint permits cancelled rows to overlap while preventing **all confirmed conflicts atomically**. With two concurrent inserts, one must fail; return HTTP `409 Conflict` or equivalent user-facing conflict feedback, handling PostgreSQL SQLSTATE `23P01` (which might arrive wrapped inside an ORM error). Do not remove or silently bypass the constraint when migrations are regenerated. Do not rely on `prisma db push` as a substitute for committed migrations.

### 5.2 Required constraints and queries

- Unique `User.email`; index `Reservation(userId, startAt)` for history; useful index on `Reservation(resourceId, startAt)` where appropriate.
- FK integrity with a deliberate deletion policy; deactivate resources rather than deleting ones with bookings.
- Validate positive capacity and nonempty strings; enforce `endAt > startAt` in DB **and** server.
- Server checks: authenticated user, currently active resource, future start time, access permissions; always handle database races.
- Availability: fetch confirmed intervals intersecting `[windowStart, windowEnd)` using `startAt < windowEnd AND endAt > windowStart`.
- To change a confirmed booking, either implement one safe transactional update (still constraint-protected), or explicitly make edit out of scope and provide cancel/rebook.

### 5.3 ER diagram deliverable

Produce a shareable diagram using <https://dbdiagram.io> or draw.io. Put the public/viewable **actual** URL in `docs/ERD.md` and this README once created. Include columns, PKs, FKs, cardinalities and statuses. If dbdiagram DBML cannot represent exclusion constraints, annotate the constraint in the diagram description and point to the SQL migration. **Do not invent the URL.**

ERD: [`docs/ERD.md`](docs/ERD.md) contains the diagram (Mermaid, rendered by GitHub), relationships, constraints, indexes and DBML source for dbdiagram.io. Public dbdiagram.io link: **TODO — add real accessible link before submission**.

## 6. Git workflow: one branch for EACH task

**Main principle:** Implement one `RRMS-XX` task at a time, with related subtasks and focused commits. Branch from updated `main`; finish, test, review, merge, and delete the task branch before starting the next. Do not branch each tiny checkbox.

```bash
# Beginning of a task (replace ID and slug)
git switch main
git pull --ff-only origin main
git switch -c feature/RRMS-03-auth

# After implementing an independently testable subtask
git status
git add path/to/changed/files
git diff --cached
git commit -m "feat(RRMS-03): implement secure login"
git push -u origin feature/RRMS-03-auth

# After all subtasks pass, merge through a GitHub PR (preferred)
# OR, if working locally without a PR:
git switch main
git merge --no-ff feature/RRMS-03-auth
git push origin main
git branch -d feature/RRMS-03-auth
```

Use `fix`, `test`, `docs`, `chore` or `refactor` instead of `feat` when appropriate. If opening PRs, merge on GitHub, then `git switch main && git pull --ff-only origin main && git branch -d feature/RRMS-03-auth`. Never merge both locally and on GitHub. No force-push to `main`. Avoid `git add .` unless the status is reviewed.

### Commit authorship and AI-assistance preference

- You are the sole human developer and GitHub repository owner. Commit with **your own configured Git name and verified email**.
- You want concise **technical** commit messages such as `fix(RRMS-05): reject overlapping time slots` rather than marketing or tool credits.
- Do **not** add a `Co-Authored-By: Claude` trailer, `Generated by Claude` trailer, automated agent signer, or AI promotional text to commits/PRs. Check the current Claude Code **attribution settings** if its defaults add a trailer; verify each proposed commit with `git log -1 --format=full` before pushing.
- This preference concerns Git metadata, **not a request to misrepresent work or evade employer disclosure requirements**. If PrimeWave Lab asks how AI was used, explain it truthfully and demonstrate understanding of every line and decision. No one can promise a single GitHub contributor based solely on settings; inspect your repository's Contributors page.
- Never add bots, false identities or fabricated commit history. Make commits only for real development work.

## 7. Task-by-task development roadmap

Mark each checkbox only after completing and verifying it. For every task: create branch → implement subtasks → run relevant checks → add real commits → push → merge → update README checklist. Dependencies are explicit.

### RRMS-00 — Repository and developer setup

**Branch:** `feature/RRMS-00-bootstrap` (if the initial README commit was already placed on main, the bootstrap branch can cover remaining setup). **Depends on:** none.

- [x] RRMS-00.1 Install/check Node, npm, Git and PostgreSQL.
- [x] RRMS-00.2 Scaffold Next.js TypeScript App Router with Tailwind/ESLint.
- [x] RRMS-00.3 Confirm local app runs, folder structure and `.gitignore`.
- [x] RRMS-00.4 Configure personal Git name/email and empty GitHub remote.
- [x] RRMS-00.5 Add README and push initial repository.

**Done when:** `npm run dev` works, repository exists on GitHub, no secrets committed. Suggested commits: `chore(RRMS-00): scaffold Next.js application`, `docs(RRMS-00): document delivery plan`.

### RRMS-01 — Database/tooling foundation

**Branch:** `feature/RRMS-01-db-tooling`. **Depends on:** RRMS-00.

- [x] RRMS-01.1 Install Prisma/client, Zod, auth packages, test runner.
- [x] RRMS-01.2 Create PostgreSQL `rrms_db` and application role locally.
- [x] RRMS-01.3 Configure `.env.example`, ignored local secrets, DB client singleton.
- [x] RRMS-01.4 Add scripts for typecheck, lint, test; verify DB connection. (Seed script is added with the seed itself in RRMS-02.4.)
- [x] RRMS-01.5 Record exact working run/setup commands.

**Done when:** Prisma connects to local PostgreSQL; lint/typecheck pass. Suggested commits: `chore(RRMS-01): configure database tooling`, `chore(RRMS-01): add validation and test scripts`.

### RRMS-02 — Schema, migrations, ERD and seeds

**Branch:** `feature/RRMS-02-schema-erd`. **Depends on:** RRMS-01.

- [x] RRMS-02.1 Implement User, Resource, Reservation schema, statuses and relations.
- [x] RRMS-02.2 Generate migration; insert valid-time CHECK and partial GiST exclusion constraint **into a committed SQL migration**.
- [x] RRMS-02.3 Apply migrations to a fresh local DB; inspect actual DB constraints.
- [x] RRMS-02.4 Implement idempotent demo seed: admin, user, 6 varied resources and sample confirmed/cancelled reservations; hash passwords.
- [ ] RRMS-02.5 Create shareable ER diagram; document relationships, indexes and constraint. (Diagram, DBML and documentation are in `docs/ERD.md`; the public dbdiagram.io link is still to be created.)
- [x] RRMS-02.6 Test DB directly: overlapping confirmed insert fails; adjacent intervals succeed; cancelled records don't block.

**Done when:** fresh database reset/migrate/seed reproduces demo data and database itself prevents overlap. Suggested commits: `feat(RRMS-02): add reservation schema and exclusions`, `chore(RRMS-02): seed demo resources`, `docs(RRMS-02): add ER diagram`.

### RRMS-03 — Authentication and authorization

**Branch:** `feature/RRMS-03-auth`. **Depends on:** RRMS-02.

- [x] RRMS-03.1 Add seeded `ADMIN` and `USER` credentials with bcrypt password checking.
- [x] RRMS-03.2 Implement server-backed login/logout and secure sessions.
- [x] RRMS-03.3 Build clean login UI and protected application layout/navbar.
- [x] RRMS-03.4 Restrict resource mutations to admins; booking actions to authenticated users. (Guards in `src/server/authz.ts`, unit-tested; each RRMS-04/05 service calls them and gets its own integration tests.)
- [x] RRMS-03.5 Enforce reservation ownership on cancel; prevent role escalation and trusting submitted user IDs. (Role is reloaded from the database on every request; the acting user always comes from the session. The cancel service in RRMS-05 applies `assertCanManageReservation`.)
- [x] RRMS-03.6 Test anonymous access, wrong password, role restrictions and ownership.

**Done when:** both demo accounts work, server-side permissions are effective even via direct request. Suggested commits: `feat(RRMS-03): implement credentials authentication`, `test(RRMS-03): cover role and ownership guards`.

### RRMS-04 — Resource management

**Branch:** `feature/RRMS-04-resources`. **Depends on:** RRMS-03.

- [x] RRMS-04.1 Resource list/grid with search/filter by type/location/status.
- [x] RRMS-04.2 Resource create form (admin) with Zod/server validation.
- [x] RRMS-04.3 Resource update and safe deactivate/reactivate (admin).
- [x] RRMS-04.4 Resource details showing capacity and upcoming reservations.
- [x] RRMS-04.5 Empty/loading/error states and responsive layout.
- [x] RRMS-04.6 Test invalid capacity, blank name, unauthorized edits, inactive behavior.

**Done when:** admin can manage resources, regular user only browses. Suggested commits: `feat(RRMS-04): implement resource CRUD`, `test(RRMS-04): verify resource access controls`.

### RRMS-05 — Booking services and conflict prevention (highest priority)

**Branch:** `feature/RRMS-05-reservations`. **Depends on:** RRMS-02 and RRMS-03, preferably RRMS-04.

- [x] RRMS-05.1 Create reservation validation schema and secure booking service.
- [x] RRMS-05.2 Parse timezone-aware start/end; reject past start, invalid ranges and inactive resources.
- [x] RRMS-05.3 Create confirmed reservation; translate DB exclusion violation (`23P01`) into clear conflict error.
- [x] RRMS-05.4 List my upcoming/past bookings and admin all-bookings listing.
- [x] RRMS-05.5 Cancel own reservation by updating status to `CANCELLED` (retain record/history).
- [x] RRMS-05.6 Build booking form, confirmation/error UX and reservation cards/table.
- [x] RRMS-05.7 Verify boundary behavior: same resource overlapping fails; adjacent succeeds; different resource succeeds; cancelled slot reusable.
- [x] RRMS-05.8 Write concurrent-insert integration test with **two independently attempted requests** for same slot; assert exactly one succeeds, one fails, and DB ends with one confirmed reservation.
- [x] RRMS-05.9 Ensure the same rules hold when requests bypass the UI.

**Done when:** reservation workflow works end-to-end and race test passes against real PostgreSQL. Suggested commits: `feat(RRMS-05): implement booking and cancellation`, `fix(RRMS-05): surface database booking conflicts`, `test(RRMS-05): cover concurrent reservations`.

### RRMS-06 — Availability UI

**Branch:** `feature/RRMS-06-availability`. **Depends on:** RRMS-05.

- [ ] RRMS-06.1 Query booked intervals by resource/date with interval intersection rules.
- [ ] RRMS-06.2 Show selected resource's day/week schedule or timeline with booked/free labels.
- [ ] RRMS-06.3 Show accessible local times with a clear `Asia/Colombo` indicator.
- [ ] RRMS-06.4 From resource details, open booking form prefilled with resource and selected slot.
- [ ] RRMS-06.5 Show current availability after create/cancel; handle empty state.
- [ ] RRMS-06.6 Test bookings that cross midnight and window boundaries.

**Done when:** users can clearly see free/busy periods and book without confusion. Suggested commits: `feat(RRMS-06): show resource availability timeline`.

### RRMS-07 — Dashboard, UX and accessibility

**Branch:** `feature/RRMS-07-dashboard-ux`. **Depends on:** RRMS-04, RRMS-05.

- [ ] RRMS-07.1 Dashboard counts: active resources, upcoming confirmed bookings, my bookings.
- [ ] RRMS-07.2 Upcoming reservations section and quick links to browse/book.
- [ ] RRMS-07.3 Consistent visual design across desktop/mobile; clear nav and empty states.
- [ ] RRMS-07.4 Form labels, keyboard navigation, focus styles, accessible status messages.
- [ ] RRMS-07.5 Optional: simple utilization metric with explicitly documented denominator/window (only after must-haves pass).

**Done when:** the application communicates system status immediately and works on mobile widths. Suggested commits: `feat(RRMS-07): add reservation overview`, `style(RRMS-07): polish responsive pages`.

### RRMS-08 — Testing, security and final quality gate

**Branch:** `feature/RRMS-08-quality`. **Depends on:** RRMS-03 through RRMS-07.

- [ ] RRMS-08.1 Unit tests for validators and booking interval boundaries.
- [ ] RRMS-08.2 PostgreSQL integration tests for exclusion, cancelled reuse and concurrency.
- [ ] RRMS-08.3 Auth and authorization regression tests.
- [ ] RRMS-08.4 Manually test login, resource CRUD, book, conflict message, cancel, and rebook.
- [ ] RRMS-08.5 Verify `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build` pass (use actual configured scripts).
- [ ] RRMS-08.6 Check no secrets, unsafe debug endpoints, or mock-only data paths are committed.
- [ ] RRMS-08.7 Verify migration + seed from fresh database with README instructions.
- [ ] RRMS-08.8 Review accessibility, errors, form submission, correct dates/timezones.

**Done when:** project runs locally from clean setup and critical tests pass. Suggested commits: `test(RRMS-08): add booking and access regressions`, `fix(RRMS-08): resolve quality gate issues`.

### RRMS-09 — Documentation, demo and submission

**Branch:** `feature/RRMS-09-submission`. **Depends on:** RRMS-08.

- [ ] RRMS-09.1 Replace roadmap-only README text with verified features, exact setup, env, migrations, seed and run commands; retain useful roadmap as history or link to docs.
- [ ] RRMS-09.2 Document design rationale, tradeoffs, schema, race prevention, API/actions, limitations.
- [ ] RRMS-09.3 Confirm `docs/ERD.md` has public shareable link; test anonymous viewing.
- [ ] RRMS-09.4 Write and record **3–5 minute** video: problem → dashboard/resources → booking → overlapping attempt rejected → cancellation/availability → DB constraint explanation.
- [ ] RRMS-09.5 Upload video to an accessible sharing location; verify with logged-out browser.
- [ ] RRMS-09.6 Ensure GitHub repository is public or accessible to reviewers; ensure `main` contains all tasks.
- [ ] RRMS-09.7 Submit repo, ERD and video using the **same email used for the CV** at <https://forms.gle/HzQH6tB5c4edPjnn8> **before 15 Oct 2026 11:59 PM Sri Lanka time**.
- [ ] RRMS-09.8 Capture submission confirmation for personal records.

**Done when:** all submission links are reachable and form confirmation is saved. Suggested commits: `docs(RRMS-09): finalize setup and design notes`, `docs(RRMS-09): add demo instructions`.

### RRMS-10 — Continuous integration

**Branch:** `feature/RRMS-10-ci-pipeline`. **Depends on:** RRMS-01. See [4.7 Continuous integration](#47-continuous-integration-rrms-10).

- [x] RRMS-10.1 Add a GitHub Actions workflow triggered on pushes and pull requests to `main`.
- [x] RRMS-10.2 Run install, Prisma validation, lint, typecheck, migrations, migration drift check, tests and build against a temporary PostgreSQL service.
- [x] RRMS-10.3 Document the workflow and add the CI status badge.
- [x] RRMS-10.4 Confirm the workflow passes on GitHub for the feature branch.
- [ ] RRMS-10.5 After merge, optionally require the CI check in branch protection for `main`.

**Done when:** the workflow passes on GitHub and the badge shows the result for `main`. Suggested commits: `ci(RRMS-10): add GitHub Actions quality gate`, `docs(RRMS-10): document CI pipeline`.

## 8. Timeboxed execution plan (deadline is tight)

| Date (Asia/Colombo) | Target | Must demonstrate |
| --- | --- | --- |
| Tue 13 Oct (remaining time) | RRMS-00, RRMS-01, RRMS-02 | App starts, database migrates, exclusion constraint works |
| Wed 14 Oct | RRMS-03, RRMS-04, RRMS-05 | Auth, resources, reservation, cancellation, concurrent conflict prevention |
| Thu 15 Oct (early) | RRMS-06, RRMS-07, RRMS-08 | Availability, dashboard, tests/build |
| Thu 15 Oct (well before deadline) | RRMS-09 | README, ERD, video, verified links, form submitted |

**If running short:** protect RRMS-02/03/04/05/08/09; use a simple availability list; skip optional metrics and visual extras. Stop feature work early enough to record the video and submit. Deadline is **not** a time to begin debugging a large new feature.

## 9. Daily Claude Code operating procedure

1. Read this README **completely**. Inspect current files and `git status`; identify first incomplete RRMS task and its unmet dependencies.
2. Explain the task plan in plain language and any design decision before editing. Do not pretend checkboxes are complete.
3. Create/check out the correctly named task branch from up-to-date `main`. If a branch already exists, resume it; do not create duplicates.
4. Implement **one subtask at a time**. Use smallest reasonable code changes with understandable names and comments on tricky behavior.
5. Run an appropriate check after each meaningful subtask. Fix problems, do not skip failing tests.
6. Show changed files and actual command results. Stage only relevant files. Propose meaningful conventional commits with the task ID.
7. Use the configured **human developer's Git identity**; no AI co-author footers or promotional trailers. Never rewrite others' authorship or invent commits.
8. On task completion, run the task acceptance checks, push branch, open PR (if available) or describe safe manual merge, update checkboxes, and proceed to next task only after merging.
9. If a command fails or credentials/permissions are missing, stop that operation, explain the exact fix, and continue with safe independent work. Never claim successful pushes, tests, videos or submissions without evidence.
10. For any tradeoff, optimize for **a small reliable finished submission**; do not deploy.

### Master prompt to paste into Claude Code

```text
You are my senior full-stack pair programmer helping me complete a SOLO software engineering internship take-home test. Read README.md fully and treat its RRMS task IDs, dependencies, acceptance criteria and deadline as the source of truth. We are building a local-only Next.js App Router + TypeScript + PostgreSQL reservation system. DO NOT deploy it.

My workflow is strict:
- Start by inspecting the repository, local environment and git status. Identify the first incomplete task. Do not claim anything is complete without testing.
- For each RRMS-XX task, branch from up-to-date main as feature/RRMS-XX-short-description. Finish its subtasks incrementally, with scoped code and real tests, before starting another task. Do not generate fake progress or arbitrary commits.
- Make logically separated commits labeled with the task ID, e.g. feat(RRMS-05): validate reservations. Use ONLY my own configured Git author name and email. I do NOT want Co-Authored-By: Claude, Generated by Claude, tool signatures or agent credits in Git commit messages or PR bodies. Check the active Claude Code attribution setting and confirm git log formatting after each commit. Never fabricate authorship or hide assistance if the employer asks about AI usage.
- Do not add any GitHub collaborator or bot identity. I will be the sole human developer; confirm the actual GitHub Contributors page rather than promising its contents.
- Explain what you implement so I can defend each decision in my technical interview. Use idiomatic typed code and clear folder structure. Do not over-engineer.
- Treat PostgreSQL EXCLUDE USING gist for overlapping CONFIRMED reservations as non-negotiable. Preserve it in a versioned SQL migration. Test concurrent attempts, cancelled slot reuse and adjacent intervals against the actual DB.
- Perform authorization and Zod validation server-side. Keep secrets out of Git. Show error and empty states; handle timestamps and Asia/Colombo display correctly.
- Run relevant tests, lint, typecheck and build. Report command results truthfully. If tools, credentials, a database service or network are missing, explain exactly what I need to do; don't invent success.
- Finish with a verified README, migrations/seeds, shareable ER diagram, 3–5 minute demo plan, and submission checklist. No deployment.

Begin with RRMS-00 or the first unfinished task, show me the precise shell commands you intend to use, and implement its first subtask now.
```

## 10. Exact command reference (verify after implementation)

```bash
# Install application dependencies
npm install

# Prepare local DB (once .env and prisma config are correct)
npx prisma migrate dev

# Seed demo users/resources/reservations (idempotent; safe to re-run)
npm run db:seed

# Start local app
npm run dev

# Quality gate
npm run lint
npm run typecheck
npm test
npm run build

# HTTP smoke test of login/session/access control (needs npm run dev running and a seeded DB)
npm run smoke:auth

# HTTP smoke test of resource management. It WRITES data, so run it only against a
# server that uses the disposable test database (it can run alongside npm run dev):
set -a; . ./.env; set +a
DATABASE_URL="$TEST_DATABASE_URL" npm run db:seed
npm run build && DATABASE_URL="$TEST_DATABASE_URL" npx next start -p 3001   # separate terminal
npm run smoke:resources -- http://localhost:3001
npm run smoke:reservations -- http://localhost:3001   # same server; also writes data

# Check current branch and commits
git status
git branch --show-current
git log -5 --format=full
```

Demo accounts created by `npm run db:seed` (**local demo only**; all share the password `Demo@12345`). Sign in at <http://localhost:3000/login>.

| Email | Role | Purpose |
| --- | --- | --- |
| `admin@rrms.local` | ADMIN | Manage resources, see all bookings |
| `user@rrms.local` | USER | Browse, book and cancel own bookings |
| `user2@rrms.local` | USER | Second user for ownership checks |

The seed also creates 6 resources (one inactive) and 6 reservations dated relative to today in Asia/Colombo: back-to-back bookings, a cancelled booking overlapping a confirmed one, and a past booking.

## 11. Demo video outline (3–5 minutes)

- **0:00–0:30** Problem and concise scope (no double bookings, clear visibility, audit trail).
- **0:30–1:10** Sign in and show role-based dashboard + resource filtering.
- **1:10–2:00** Admin resource create/update and user booking.
- **2:00–2:50** Try an overlapping reservation; show informative rejection. Explain that the DB prevents races, not merely the UI.
- **2:50–3:30** Cancel a booking, confirm slot becomes available, show history.
- **3:30–4:30** Show schema/ERD, SQL migration with GiST constraint, key tests and architecture.
- **4:30–5:00** Summarize setup and tradeoffs. Do not claim unsupported features.

Keep the video within 3–5 minutes and make the text readable. Use a local running server and seeded accounts. Ensure passwords/secrets are not visible in recording.

## 12. Final submission checklist

- [ ] GitHub repository accessible: **TODO: insert actual URL**
- [ ] Latest finished tasks merged into `main`; `git status` clean.
- [ ] Clone-on-fresh-machine instructions (Node, PostgreSQL, env, migrate, seed, run) verified.
- [ ] README distinguishes implemented vs planned features and documents limitations.
- [ ] PostgreSQL overlap constraint is committed and tested.
- [ ] Demo data, screenshots or walkthrough sufficient to test locally.
- [ ] ER diagram accessible: **TODO: insert actual link**.
- [ ] Video accessible: **TODO: insert actual link**.
- [ ] No leaked `.env`/passwords/tokens or unnecessary deployment files.
- [ ] Submission form sent with same CV email before the hard deadline.

## 13. Decision log (fill in as built)

1. **Concurrency:** DB-enforced partial GiST exclusion constraint is safer than pre-insert checks and survives simultaneous requests.
2. **Booking status:** Soft cancellation preserves booking history and releases availability.
3. **Dates:** Save precise instants (`timestamptz`), use end-exclusive ranges, and display timezone explicitly.
4. **Scope:** Three tables and simple availability timeline reduce risk of unfinished extras.
5. **No deployment:** Local setup, reproducible migrations and a demo recording are the delivery mechanism.
6. **UTC database sessions:** `@prisma/adapter-pg` sends timestamps as UTC text without an offset, which PostgreSQL interprets in the session time zone. On a server whose default is `Asia/Colombo` every instant was stored 5h30m early, and Prisma's symmetric read-back hid it. `src/lib/db.ts` sets `TimeZone=UTC` on every connection; `tests/integration/timestamps.test.ts` fails without it.
7. **Concurrent conflicts surface as `23P01` or `40P01`:** With several simultaneous inserts for one slot, PostgreSQL may resolve the waiting cycle with its deadlock detector, so losers can fail with `40P01` (deadlock_detected) instead of `23P01` (exclusion_violation). Only one booking is ever stored. `src/server/db-errors.ts` maps both codes to a `ConflictError` (HTTP 409 semantics) whose message names the clashing Colombo time slots but not who booked them. With `@prisma/adapter-pg` the SQLSTATE is not in `error.code` (Prisma reports the generic `P2039`) but in `meta.driverAdapterError.cause.originalCode`, which is what the mapper reads.
8. **Resource visibility and lifecycle:** Regular users only ever see active resources (inactive ones are excluded from lists and their pages return not-found, whatever filters are sent). Admins can filter by status. Resources are never deleted: deactivation keeps booking history and existing bookings, and the booking service refuses new bookings for inactive resources. On a resource page everyone sees when it is booked, but who booked it and why is shown only to admins and the booker.
9. **Authentication approach and tradeoffs:** Credentials only, with bcrypt (cost 12) password hashes. The session is a signed HS256 JWT (`jose`, `AUTH_SECRET`) in an httpOnly, SameSite=Lax cookie (Secure in production) that expires after 8 hours and holds only the user ID. The user and role are reloaded from the database on every request (`getCurrentUser` in `src/lib/session.ts`), so demotions and deleted accounts take effect immediately. All checks run server-side in a Data Access Layer and in services via `src/server/authz.ts`; there is no Proxy-only protection. Login returns one generic error and compares against a dummy hash for unknown emails, so accounts cannot be enumerated. Admins may cancel any reservation; users only their own. `next-auth` was not used because its credentials-capable v5 is still beta.
10. **Validation/testing choices:** Every input is validated with Zod inside the service layer (`src/server/*-service.ts`), so server actions, pages and any direct request get identical rules; schemas never contain `userId` or `status`, and the acting user always comes from the session. Booking times are `datetime-local` values interpreted as Asia/Colombo time (bookings may cross midnight, up to 14 days). "Start in the future", inactive resources and ownership are checked in the service; overlap is left to PostgreSQL. Tests run against real PostgreSQL (`rrms_test`): raw-SQL constraint tests, service integration tests (overlap shapes, adjacency, other resources, cross-midnight, cancelled-slot reuse, a 9-way concurrent race through the service, ownership) and HTTP smoke tests that replay server actions without the UI, including two simultaneous HTTP booking requests. Key tests were mutation-checked (removing the guard makes them fail).
11. **Known limitations:**
    - Sessions are stateless: signing out deletes the cookie, but a copied token stays valid until it expires (8h). Server-side revocation would need a session table.
    - No login rate limiting or account lockout (acceptable for a local demo; required before any real deployment).
    - No self-service registration; accounts come from the seed.
    - Bookings cannot be edited: cancel and rebook instead (README 5.2 allows this).
    - The inactive-resource check and the insert are separate statements, so a booking made in the instant an admin deactivates a resource can still succeed. Overlap protection is unaffected.
    - The `40P01` (deadlock) to conflict mapping is covered by unit tests; the service-level race only produced `23P01` in repeated runs, while the raw-SQL race (RRMS-02) produced `40P01`.

### Useful references

- Next.js setup: <https://nextjs.org/docs/app/getting-started/installation>
- Prisma migrations: <https://www.prisma.io/docs/orm/prisma-migrate>
- PostgreSQL exclusion constraints: <https://www.postgresql.org/docs/current/sql-createtable.html>
- Claude Code settings: <https://code.claude.com/docs/en/settings>

---

**Ownership of work:** The developer must understand, test and be able to explain the code and design. AI-assisted development is permitted by the brief; Git commit authorship and required disclosures should always remain accurate.
