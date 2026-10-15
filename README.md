# Resource Reservation Management System (RRMS)

[![CI](https://github.com/bineth-ellepola/Resource-Reservation-Management-System/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bineth-ellepola/Resource-Reservation-Management-System/actions/workflows/ci.yml)

A web application for booking shared meeting rooms, equipment, vehicles and labs. Users see when a resource is free and book or cancel time slots; administrators manage the resources and can see every booking. PostgreSQL itself refuses overlapping confirmed bookings, so two people can never hold the same slot, even when they press **Book** at the same moment.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Prisma 7 and PostgreSQL. It runs locally; nothing is deployed.

| | |
| --- | --- |
| ER diagram | [docs/ERD.md](docs/ERD.md) (renders on GitHub) · [dbdiagram.io](https://dbdiagram.io/d/RRMS_assingment-6ad096c5064322c8695a7dc7) |
| Demo video | **TODO: add link** |
| Development plan and decision log | [docs/ROADMAP.md](docs/ROADMAP.md) |

## Features

- **Sign in** with the demo accounts below; sessions last 8 hours and can be ended with **Sign out**.
- **Dashboard:** active resources, your upcoming bookings, your bookings today and your next five bookings. Administrators also see all upcoming bookings, bookings by status (upcoming, completed, cancelled) and everyone's next bookings.
- **Resources:** search by name or location and filter by type (administrators can also filter by active status). Each resource page shows its type, location, capacity and upcoming bookings.
- **Availability:** a day or week view of free and booked periods. A free period's **Book** link opens the booking form with the resource and time filled in.
- **Booking:** choose a resource, start and end. Bookings may cross midnight and last up to 14 days. The server rejects past start times, an end before the start, inactive resources and conflicts; a conflict message names the clashing times but not who booked them.
- **My bookings:** upcoming bookings and history (past and cancelled). Users can cancel their own bookings that have not ended; cancelled bookings stay in the history and free the slot.
- **Administration:** create, edit, deactivate and reactivate resources (resources are never deleted, so history is kept), and see or cancel anyone's booking.
- **Privacy:** everyone can see when a resource is booked, but only administrators and the booker see who booked it and why. Regular users never see inactive resources.

All times are shown in Asia/Colombo (UTC+05:30), and the pages say so next to every time.

## Getting started

**Prerequisites:** Node.js 24 or newer, npm, Git and PostgreSQL 18 (the version used in CI and local testing). The commands below are for macOS and Linux; on Windows, use Git Bash.

1. **Clone and install.** `postinstall` also generates the Prisma client.

   ```bash
   git clone https://github.com/bineth-ellepola/Resource-Reservation-Management-System.git
   cd Resource-Reservation-Management-System
   npm install
   ```

2. **Create a database role and two databases** as the PostgreSQL superuser (for example in `psql -U postgres`):

   ```sql
   CREATE ROLE rrms_app WITH LOGIN CREATEDB PASSWORD 'choose-a-local-password';
   CREATE DATABASE rrms_db OWNER rrms_app;    -- application and demo data
   CREATE DATABASE rrms_test OWNER rrms_app;  -- integration tests (their tables get emptied)
   ```

   The role does not need superuser rights: `btree_gist`, which the double-booking constraint uses, is a trusted extension that a database owner can create.

3. **Configure the environment.** Copy `.env.example` to `.env`, put the role's password into `DATABASE_URL` and `TEST_DATABASE_URL` (percent-encode special characters, for example `@` becomes `%40`), and set `AUTH_SECRET` to a random value:

   ```bash
   cp .env.example .env
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # paste the output into AUTH_SECRET
   ```

4. **Create the tables and load the demo data:**

   ```bash
   npx prisma migrate deploy        # creates the tables and constraints in rrms_db
   npm run db:seed                  # demo users, resources and bookings
   npm run db:check                 # optional: prints the connected user and database
   ```

5. **Start the application** and open <http://localhost:3000>:

   ```bash
   npm run dev
   ```

To run the tests, the test database needs the same tables:

```bash
set -a; . ./.env; set +a                                     # load .env into this shell
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy  # creates the tables in rrms_test
npm test
```

## Demo accounts

Created by `npm run db:seed`, for local use only:

| Email | Password | Role |
| --- | --- | --- |
| `admin@rrms.local` | `Demo@12345` | Administrator |
| `user@rrms.local` | `Demo@12345` | User |
| `user2@rrms.local` | `Demo@12345` | User (a second user, to show ownership rules) |
| `binethellepola@gmail.com` | `Bineth@123` | User |
| `dasuni@gmail.com` | `Dasuni@123` | User |

The seed also creates six resources (one inactive) and six bookings dated relative to today in Asia/Colombo: back-to-back bookings, a cancelled booking overlapping a confirmed one, and a past booking. Running the seed again is safe: it resets the demo accounts and the six demo resources and re-creates any missing demo bookings, but never moves or duplicates a booking.

## How double booking is prevented

The database decides. The migration adds this constraint ([migration.sql](prisma/migrations/20261014084547_init_reservation_schema/migration.sql)):

```sql
ALTER TABLE "Reservation"
  ADD CONSTRAINT reservation_no_confirmed_overlap
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" = 'CONFIRMED');
```

- Two confirmed bookings for the same resource cannot have overlapping time ranges. PostgreSQL checks this atomically, so when two requests race for one slot, exactly one insert succeeds.
- `'[)'` makes the end exclusive, so 10:00–11:00 and 11:00–12:00 can both be booked.
- `WHERE status = 'CONFIRMED'` lets cancelled bookings stay in the table as history without blocking the slot.
- A CHECK constraint (`reservation_valid_time`) requires every booking to end after it starts.

The application does not look for free slots before inserting, because that check could race. It inserts the booking and translates the database error: SQLSTATE `23P01` (exclusion violation), or `40P01` (deadlock), which PostgreSQL can report instead when several inserts wait on each other, becomes an "already booked" message listing the clashing times ([db-errors.ts](src/server/db-errors.ts), [reservation-service.ts](src/server/reservation-service.ts)). Tests prove this with simultaneous inserts in raw SQL, through the booking service, and as two parallel HTTP requests.

## Time zones

- Times are stored as `timestamptz` instants. The database session is pinned to UTC ([db.ts](src/lib/db.ts)) because the Prisma driver adapter sends timestamps without an offset; without that, a server whose default zone was Asia/Colombo stored every booking 5 h 30 min early. [timestamps.test.ts](tests/integration/timestamps.test.ts) guards this.
- Times typed into the booking form are read as Asia/Colombo time with an explicit offset, so the result does not depend on the server's own time zone ([dates.ts](src/lib/dates.ts)).
- The availability view and the dashboard's "today" use the half-open overlap rule (`startAt < dayEnd AND endAt > dayStart`), so a booking that crosses midnight appears on both days.

## Authentication and authorization

- Email and password, with bcrypt (cost 12) password hashes. The session is a signed HS256 JWT (`jose`, `AUTH_SECRET`) in an httpOnly, SameSite=Lax cookie (Secure in production) that holds only the user ID and expires after 8 hours.
- The user and role are loaded from the database on every request, so a changed role applies immediately.
- Every rule is checked on the server: pages require a signed-in user, and the services check roles and ownership ([authz.ts](src/server/authz.ts)). The same rules therefore apply to the forms, to replayed server actions and to hand-crafted requests. The acting user always comes from the session; a submitted `userId` or `status` is ignored.
- Users can cancel only their own bookings; administrators can cancel any booking. Only administrators can manage resources.
- A wrong email and a wrong password get the same error, and unknown emails are still checked against a dummy hash, so login cannot be used to discover accounts.
- `next-auth` was not used because its version with credentials support (v5) is still in beta.

## Architecture

```text
Browser
  → Next.js pages and server actions   src/app
  → services: Zod validation, roles     src/server, src/schemas
  → Prisma client (pg driver adapter)   src/lib/db.ts
  → PostgreSQL constraints              prisma/migrations
```

The server actions are the application's API; there are no REST route handlers.

| Server action | File | Allowed for |
| --- | --- | --- |
| `login`, `logout` | [auth.ts](src/app/actions/auth.ts) | anyone |
| `createResourceAction`, `updateResourceAction`, `setResourceActiveAction` | [resources.ts](src/app/actions/resources.ts) | administrators |
| `createReservationAction` | [reservations.ts](src/app/actions/reservations.ts) | signed-in users |
| `cancelReservationAction` | [reservations.ts](src/app/actions/reservations.ts) | the booker or an administrator |

The resource and booking actions call services in `src/server/`, which validate the input with the Zod schemas in `src/schemas/` and check permissions, so the rules hold even when a request bypasses the user interface.

```text
prisma/             schema, migration (with hand-written constraints), seed
src/app/            pages, layouts and server actions
src/components/     forms, availability schedule, navigation
src/lib/            Asia/Colombo date helpers, sessions, database client, availability logic
src/schemas/        Zod input schemas
src/server/         services, authorization rules, database error mapping
tests/unit/         validators and pure logic
tests/integration/  services and constraints against PostgreSQL
scripts/            database check and HTTP smoke tests
docs/               ER diagram and development plan
```

## Data model

Three tables: `User`, `Resource` and `Reservation`. Each reservation belongs to one user and one resource. [docs/ERD.md](docs/ERD.md) has the diagram, columns, constraints and indexes. Foreign keys use `ON DELETE RESTRICT`, and resources are deactivated rather than deleted, so booking history is never lost.

## Testing

```bash
npm run lint
npm run typecheck   # next typegen && tsc --noEmit
npm test            # 197 Vitest tests; integration tests use TEST_DATABASE_URL
npm run build
```

- **Unit tests** (`tests/unit`): validators, Asia/Colombo date handling, availability calculation, authorization rules, session tokens and database error mapping.
- **Integration tests** (`tests/integration`, real PostgreSQL): overlapping and back-to-back bookings, other resources, bookings across midnight, reusing a cancelled slot, simultaneous bookings (raw SQL and through the service), ownership and role checks, dashboard counts and UTC storage. The test setup refuses any database whose name does not end in `_test`, because these tests empty the tables.
- **HTTP smoke tests** (`scripts/`) submit the real forms without a browser, so they test what the server enforces. `smoke:auth` runs against `npm run dev`. The other two write data, so run them against a second server that uses the test database:

  ```bash
  npm run smoke:auth

  set -a; . ./.env; set +a
  DATABASE_URL="$TEST_DATABASE_URL" npm run db:seed
  npm run build && DATABASE_URL="$TEST_DATABASE_URL" npx next start -p 3001   # in a separate terminal
  npm run smoke:resources -- http://localhost:3001
  npm run smoke:reservations -- http://localhost:3001
  ```

**Continuous integration:** on every push and pull request, [GitHub Actions](.github/workflows/ci.yml) installs dependencies, validates the Prisma schema, lints, typechecks, applies the migrations to an empty PostgreSQL 18 database, checks that the schema matches the migrations, runs the tests and builds the application.

## Design decisions and trade-offs

- **Conflicts are enforced by the database,** not by checking availability in code first; only the database can stay correct under simultaneous requests.
- **Cancelling changes the status** instead of deleting the row, which keeps history and frees the slot.
- **A simple day and week availability list** instead of a calendar library: less code, accessible, and enough to choose a slot. It only guides the user; the database still decides at insert time.
- **Three tables** cover the requirements and keep the schema easy to reason about.
- **Resources are deactivated, never deleted,** so existing bookings and history stay valid while new bookings are refused.
- **Local only:** reproducible migrations, a seed and a recorded demo instead of a deployment.

The full decision log is in [docs/ROADMAP.md](docs/ROADMAP.md#13-decision-log-fill-in-as-built).

## Known limitations

- Sessions are stateless: signing out deletes the cookie, but a copied token stays valid until it expires after 8 hours. Revoking sessions would need a session table.
- There is no login rate limiting or account lockout, which a real deployment would need.
- There is no self-service registration or user management; accounts come from the seed.
- Bookings cannot be edited; cancel and book again instead.
- The inactive-resource check and the insert are separate statements, so a booking made at the very moment an administrator deactivates a resource can still succeed. Overlap protection is unaffected.
- Times are always shown in Asia/Colombo; there is no per-user time zone.
- The optional utilization metric on the dashboard was not built.
