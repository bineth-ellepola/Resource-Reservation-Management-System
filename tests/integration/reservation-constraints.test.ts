// Tests the PostgreSQL constraints themselves, using raw SQL through `pg` rather than
// Prisma, so no application or ORM code can mask what the database enforces.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: "-c TimeZone=UTC" });

type Status = "CONFIRMED" | "CANCELLED";
type Queryable = Pick<PoolClient, "query">;

let userId: string;
let roomId: string;
let otherRoomId: string;

async function insertReservation(
  db: Queryable,
  { resourceId = roomId, start, end, status = "CONFIRMED" }: { resourceId?: string; start: string; end: string; status?: Status },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO "Reservation" (id, "userId", "resourceId", "startAt", "endAt", status, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now()) RETURNING id`,
    [userId, resourceId, start, end, status],
  );
  return rows[0].id;
}

async function insertResource(name: string, capacity = 10): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO "Resource" (id, name, type, location, capacity, "updatedAt")
     VALUES (gen_random_uuid(), $1, 'MEETING_ROOM', 'Level 1', $2, now()) RETURNING id`,
    [name, capacity],
  );
  return rows[0].id;
}

/** Expects the promise to fail with the given SQLSTATE and constraint name. */
async function expectPgError(promise: Promise<unknown>, code: string, constraint: string) {
  await expect(promise).rejects.toMatchObject({ code, constraint });
}

const EXCLUSION_VIOLATION = "23P01";
const CHECK_VIOLATION = "23514";
const DEADLOCK_DETECTED = "40P01";
const OVERLAP = "reservation_no_confirmed_overlap";

// Existing booking used by most tests: 10:00-11:00 UTC.
const T = (time: string) => `2030-01-15T${time}:00Z`;

beforeEach(async () => {
  await pool.query(`TRUNCATE "Reservation", "Resource", "User" CASCADE`);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO "User" (id, name, email, "passwordHash") VALUES (gen_random_uuid(), 'Test', 'test@example.com', 'x') RETURNING id`,
  );
  userId = rows[0].id;
  roomId = await insertResource("Room 1");
  otherRoomId = await insertResource("Room 2");
});

afterAll(() => pool.end());

describe("overlap exclusion constraint", () => {
  it.each([
    ["identical interval", "10:00", "11:00"],
    ["starts inside", "10:30", "11:30"],
    ["ends inside", "09:30", "10:30"],
    ["contained", "10:15", "10:45"],
    ["containing", "09:00", "12:00"],
  ])("rejects a confirmed booking with an overlapping interval (%s)", async (_label, start, end) => {
    await insertReservation(pool, { start: T("10:00"), end: T("11:00") });
    await expectPgError(insertReservation(pool, { start: T(start), end: T(end) }), EXCLUSION_VIOLATION, OVERLAP);
  });

  it("allows adjacent intervals on both sides because ranges are [start, end)", async () => {
    await insertReservation(pool, { start: T("10:00"), end: T("11:00") });
    await insertReservation(pool, { start: T("11:00"), end: T("12:00") });
    await insertReservation(pool, { start: T("09:00"), end: T("10:00") });

    const { rows } = await pool.query(`SELECT 1 FROM "Reservation" WHERE status = 'CONFIRMED'`);
    expect(rows).toHaveLength(3);
  });

  it("allows the same interval on a different resource", async () => {
    await insertReservation(pool, { start: T("10:00"), end: T("11:00") });
    await insertReservation(pool, { resourceId: otherRoomId, start: T("10:00"), end: T("11:00") });
  });

  it("compares instants, not wall-clock text (same instant written with different offsets)", async () => {
    await insertReservation(pool, { start: "2030-01-15T15:30:00+05:30", end: "2030-01-15T16:30:00+05:30" });
    // 10:00Z is 15:30 in Asia/Colombo.
    await expectPgError(insertReservation(pool, { start: T("10:00"), end: T("10:30") }), EXCLUSION_VIOLATION, OVERLAP);
  });
});

describe("cancelled reservations", () => {
  it("do not block a new confirmed booking for the same slot", async () => {
    await insertReservation(pool, { start: T("10:00"), end: T("11:00"), status: "CANCELLED" });
    await insertReservation(pool, { start: T("10:00"), end: T("11:00") });
  });

  it("may overlap an existing confirmed booking (kept as history)", async () => {
    await insertReservation(pool, { start: T("10:00"), end: T("11:00") });
    await insertReservation(pool, { start: T("10:00"), end: T("11:00"), status: "CANCELLED" });
  });

  it("release the slot when a confirmed booking is cancelled, and the row is kept", async () => {
    const original = await insertReservation(pool, { start: T("10:00"), end: T("11:00") });
    await expectPgError(insertReservation(pool, { start: T("10:00"), end: T("11:00") }), EXCLUSION_VIOLATION, OVERLAP);

    await pool.query(`UPDATE "Reservation" SET status = 'CANCELLED' WHERE id = $1`, [original]);
    await insertReservation(pool, { start: T("10:00"), end: T("11:00") });

    const { rows } = await pool.query<{ status: Status }>(`SELECT status FROM "Reservation" ORDER BY status`);
    expect(rows.map((r) => r.status)).toEqual(["CONFIRMED", "CANCELLED"]);
  });

  it("cannot be re-confirmed if the slot has since been taken", async () => {
    const cancelled = await insertReservation(pool, { start: T("10:00"), end: T("11:00"), status: "CANCELLED" });
    await insertReservation(pool, { start: T("10:30"), end: T("11:30") });

    await expectPgError(
      pool.query(`UPDATE "Reservation" SET status = 'CONFIRMED' WHERE id = $1`, [cancelled]),
      EXCLUSION_VIOLATION,
      OVERLAP,
    );
  });
});

describe("check constraints", () => {
  it.each([
    ["end before start", "11:00", "10:00"],
    ["zero length", "10:00", "10:00"],
  ])("rejects a reservation whose end is not after its start (%s)", async (_label, start, end) => {
    await expectPgError(insertReservation(pool, { start: T(start), end: T(end) }), CHECK_VIOLATION, "reservation_valid_time");
  });

  it.each([0, -1])("rejects resource capacity %i", async (capacity) => {
    await expectPgError(insertResource("Bad", capacity), CHECK_VIOLATION, "resource_capacity_positive");
  });

  it("rejects a blank resource name", async () => {
    await expectPgError(insertResource("   "), CHECK_VIOLATION, "resource_name_not_blank");
  });
});

describe("concurrent booking attempts", () => {
  it("blocks a competing transaction until the first commits, then rejects it", async () => {
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query("BEGIN");
      await b.query("BEGIN");
      await insertReservation(a, { start: T("10:00"), end: T("11:00") });

      // B overlaps A's uncommitted row, so PostgreSQL makes B wait for A's outcome.
      let bSettled = false;
      const bInsert = insertReservation(b, { start: T("10:30"), end: T("11:30") }).finally(() => {
        bSettled = true;
      });
      bInsert.catch(() => {}); // asserted below; avoid an unhandled rejection meanwhile
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(bSettled).toBe(false);

      await a.query("COMMIT");
      await expectPgError(bInsert, EXCLUSION_VIOLATION, OVERLAP);
      await b.query("ROLLBACK");
    } finally {
      a.release();
      b.release();
    }

    const { rows } = await pool.query(`SELECT 1 FROM "Reservation" WHERE status = 'CONFIRMED'`);
    expect(rows).toHaveLength(1);
  });

  // Several in-flight inserts for the same slot can end up waiting on each other's
  // uncommitted rows. PostgreSQL then resolves the cycle with its deadlock detector,
  // so a loser may fail with 40P01 (deadlock_detected) instead of 23P01, roughly one
  // per deadlock_timeout (1s by default). Either way no second booking is stored,
  // and the booking service must treat both codes as "slot already taken".
  it(
    "lets exactly one of many simultaneous requests for the same slot succeed",
    async () => {
      const attempts = 10;
      const results = await Promise.allSettled(
        Array.from({ length: attempts }, () => insertReservation(pool, { start: T("10:00"), end: T("11:00") })),
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(attempts - 1);
      for (const r of rejected) {
        expect([EXCLUSION_VIOLATION, DEADLOCK_DETECTED]).toContain(r.reason.code);
      }

      const { rows } = await pool.query(`SELECT 1 FROM "Reservation" WHERE status = 'CONFIRMED'`);
      expect(rows).toHaveLength(1);
    },
    30_000,
  );
});
