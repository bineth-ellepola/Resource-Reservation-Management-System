import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/server/auth-service";
import { AuthError } from "@/server/authz";
import { getDashboardSummary } from "@/server/dashboard-service";
import { createUser, insertResource, resetDatabase, toSessionUser } from "../helpers/db";

// 10:30 on Tue 15 Jan 2030 in Asia/Colombo (UTC+05:30).
const NOW = new Date("2030-01-15T05:00:00Z");

let admin: SessionUser;
let alice: SessionUser;
let bob: SessionUser;
let roomId: string;

// Inserts directly so past bookings can be created; times are Asia/Colombo wall-clock.
function insertReservation(
  user: SessionUser,
  start: string,
  end: string,
  status: "CONFIRMED" | "CANCELLED" = "CONFIRMED",
) {
  return prisma.reservation.create({
    data: {
      userId: user.id,
      resourceId: roomId,
      startAt: new Date(`${start}:00+05:30`),
      endAt: new Date(`${end}:00+05:30`),
      status,
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  admin = toSessionUser(await createUser({ email: "admin@example.com", role: "ADMIN", name: "Admin" }));
  alice = toSessionUser(await createUser({ email: "alice@example.com", name: "Alice" }));
  bob = toSessionUser(await createUser({ email: "bob@example.com", name: "Bob" }));
  roomId = (await insertResource({ name: "Board Room" })).id;
  await insertResource({ name: "Huddle Room" });
  await insertResource({ name: "Old Projector", type: "EQUIPMENT", isActive: false });

  await insertReservation(alice, "2030-01-14T09:00", "2030-01-14T10:00"); // past (completed)
  await insertReservation(alice, "2030-01-15T10:00", "2030-01-15T11:00"); // in progress today
  await insertReservation(alice, "2030-01-15T23:00", "2030-01-16T01:00"); // today, crosses midnight
  await insertReservation(alice, "2030-01-15T12:00", "2030-01-15T13:00", "CANCELLED");
  await insertReservation(bob, "2030-01-17T09:00", "2030-01-17T10:00"); // later this week
});

afterAll(() => prisma.$disconnect());

describe("getDashboardSummary", () => {
  it("requires a signed-in user", async () => {
    await expect(getDashboardSummary(null, NOW)).rejects.toBeInstanceOf(AuthError);
  });

  it("gives a regular user only their own bookings and no system-wide numbers", async () => {
    const summary = await getDashboardSummary(alice, NOW);

    expect(summary.today).toBe("2030-01-15");
    expect(summary.activeResources).toBe(2);
    // An in-progress booking still counts as upcoming; cancelled and ended ones do not.
    expect(summary.mine.upcomingCount).toBe(2);
    expect(summary.mine.todayCount).toBe(2);
    expect(summary.mine.upcoming.map((r) => r.startAt.toISOString())).toEqual([
      "2030-01-15T04:30:00.000Z",
      "2030-01-15T17:30:00.000Z",
    ]);
    expect(summary.mine.upcoming.every((r) => r.userId === alice.id)).toBe(true);
    expect(summary.system).toBeNull();
  });

  it("counts a booking that crosses midnight on the next Colombo day too", async () => {
    const summary = await getDashboardSummary(alice, new Date("2030-01-15T19:00:00Z")); // 00:30 on 16 Jan
    expect(summary.today).toBe("2030-01-16");
    expect(summary.mine.todayCount).toBe(1);
  });

  it("gives an admin system-wide counts, a status breakdown and everyone's next bookings", async () => {
    const summary = await getDashboardSummary(admin, NOW);

    expect(summary.mine.upcomingCount).toBe(0);
    expect(summary.system).toMatchObject({
      inactiveResources: 1,
      upcomingCount: 3,
      todayCount: 2,
      byStatus: { upcoming: 3, completed: 1, cancelled: 1 },
    });
    expect(summary.system?.upcoming.map((r) => r.user.name)).toEqual(["Alice", "Alice", "Bob"]);
  });

  it("limits the upcoming list to five but keeps the full count", async () => {
    for (let day = 20; day < 27; day++) {
      await insertReservation(bob, `2030-01-${day}T09:00`, `2030-01-${day}T10:00`);
    }
    const summary = await getDashboardSummary(bob, NOW);
    expect(summary.mine.upcomingCount).toBe(8);
    expect(summary.mine.upcoming).toHaveLength(5);
    expect(summary.mine.upcoming[0].startAt.toISOString()).toBe("2030-01-17T03:30:00.000Z");
  });
});
