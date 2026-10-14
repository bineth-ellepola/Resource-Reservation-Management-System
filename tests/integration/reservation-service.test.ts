import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/server/auth-service";
import { AuthError } from "@/server/authz";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import {
  cancelReservation,
  createReservation,
  listAllReservations,
  listMyReservations,
} from "@/server/reservation-service";
import { createUser, insertResource, resetDatabase, toSessionUser } from "../helpers/db";

// All times below are Asia/Colombo wall-clock values, as typed into the booking form.
const NOW = new Date("2030-01-14T00:00:00Z");

let admin: SessionUser;
let alice: SessionUser;
let bob: SessionUser;
let roomId: string;
let otherRoomId: string;

beforeEach(async () => {
  await resetDatabase();
  admin = toSessionUser(await createUser({ email: "admin@example.com", role: "ADMIN", name: "Admin" }));
  alice = toSessionUser(await createUser({ email: "alice@example.com", name: "Alice" }));
  bob = toSessionUser(await createUser({ email: "bob@example.com", name: "Bob" }));
  roomId = (await insertResource({ name: "Board Room" })).id;
  otherRoomId = (await insertResource({ name: "Huddle Room" })).id;
});

afterAll(() => prisma.$disconnect());

const book = (actor: SessionUser | null, start: string, end: string, extra: Record<string, unknown> = {}) =>
  createReservation(actor, { resourceId: roomId, start: `2030-01-15T${start}`, end: `2030-01-15T${end}`, ...extra }, NOW);

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error("expected the promise to reject");
    },
    (error: unknown) => error,
  );
}

async function expectFieldError(promise: Promise<unknown>, field: string, message: string) {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(ValidationError);
  expect((error as ValidationError).fieldErrors[field]).toContain(message);
}

const confirmedCount = () => prisma.reservation.count({ where: { status: "CONFIRMED" } });

describe("createReservation", () => {
  it("creates a confirmed booking for the signed-in user, interpreting times as Asia/Colombo", async () => {
    const reservation = await book(alice, "09:00", "10:00", { purpose: "  Planning  " });
    expect(reservation).toMatchObject({ userId: alice.id, status: "CONFIRMED", purpose: "Planning" });
    expect(reservation.startAt.toISOString()).toBe("2030-01-15T03:30:00.000Z");
    expect(reservation.endAt.toISOString()).toBe("2030-01-15T04:30:00.000Z");
  });

  it("ignores a submitted userId and status: the owner comes from the session", async () => {
    const reservation = await book(alice, "09:00", "10:00", { userId: bob.id, status: "CANCELLED" });
    expect(reservation.userId).toBe(alice.id);
    expect(reservation.status).toBe("CONFIRMED");
  });

  it("requires a signed-in user", async () => {
    const error = await rejection(book(null, "09:00", "10:00"));
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).status).toBe(401);
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("rejects a start in the past or exactly now", async () => {
    await expectFieldError(
      createReservation(alice, { resourceId: roomId, start: "2030-01-13T09:00", end: "2030-01-13T10:00" }, NOW),
      "start",
      "The start must be in the future.",
    );
    // NOW is 05:30 on 14 Jan in Colombo.
    await expectFieldError(
      createReservation(alice, { resourceId: roomId, start: "2030-01-14T05:30", end: "2030-01-14T06:30" }, NOW),
      "start",
      "The start must be in the future.",
    );
  });

  it.each([
    ["end before start", "10:00", "09:00"],
    ["zero length", "10:00", "10:00"],
  ])("rejects %s", async (_label, start, end) => {
    await expectFieldError(book(alice, start, end), "end", "End must be after the start.");
  });

  it("rejects bookings longer than 14 days", async () => {
    await expectFieldError(
      createReservation(alice, { resourceId: roomId, start: "2030-01-15T09:00", end: "2030-01-29T09:01" }, NOW),
      "end",
      "A booking can last at most 14 days.",
    );
  });

  it.each([
    ["2030-02-30T09:00", "impossible date"],
    ["2030-01-15 09:00", "wrong format"],
    ["", "empty"],
  ])("rejects start %j (%s)", async (start) => {
    const error = await rejection(createReservation(alice, { resourceId: roomId, start, end: "2030-01-15T10:00" }, NOW));
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors.start?.[0]).toMatch(/Enter a (valid )?start date and time\./);
  });

  it("rejects inactive and unknown resources", async () => {
    await prisma.resource.update({ where: { id: roomId }, data: { isActive: false } });
    await expectFieldError(book(alice, "09:00", "10:00"), "resourceId", "This resource is inactive and cannot be booked.");
    await expectFieldError(
      createReservation(alice, { resourceId: "11111111-1111-4111-8111-111111111111", start: "2030-01-15T09:00", end: "2030-01-15T10:00" }, NOW),
      "resourceId",
      "That resource does not exist.",
    );
    await expectFieldError(
      createReservation(alice, { resourceId: "not-a-uuid", start: "2030-01-15T09:00", end: "2030-01-15T10:00" }, NOW),
      "resourceId",
      "Choose a resource.",
    );
  });
});

describe("booking boundaries", () => {
  it.each([
    ["identical", "09:00", "10:00"],
    ["starts inside", "09:30", "10:30"],
    ["ends inside", "08:30", "09:30"],
    ["contained", "09:15", "09:45"],
    ["containing", "08:00", "11:00"],
  ])("rejects an overlapping booking on the same resource (%s) with a clear conflict", async (_label, start, end) => {
    await book(alice, "09:00", "10:00");
    const error = await rejection(book(bob, start, end));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(
      "Board Room is already booked for part of that time (Tue 15 Jan 2030, 09:00–10:00). Please choose another time.",
    );
    expect(await confirmedCount()).toBe(1);
  });

  it("does not reveal who holds the clashing booking", async () => {
    await book(alice, "09:00", "10:00", { purpose: "Secret" });
    const error = await rejection(book(bob, "09:00", "10:00"));
    expect((error as Error).message).not.toMatch(/Alice|Secret/);
  });

  it("allows back-to-back bookings on both sides", async () => {
    await book(alice, "09:00", "10:00");
    await book(bob, "10:00", "11:00");
    await book(bob, "08:00", "09:00");
    expect(await confirmedCount()).toBe(3);
  });

  it("allows the same time on a different resource", async () => {
    await book(alice, "09:00", "10:00");
    await createReservation(bob, { resourceId: otherRoomId, start: "2030-01-15T09:00", end: "2030-01-15T10:00" }, NOW);
    expect(await confirmedCount()).toBe(2);
  });

  it("detects overlaps across midnight", async () => {
    await createReservation(alice, { resourceId: roomId, start: "2030-01-15T22:00", end: "2030-01-16T02:00" }, NOW);
    const error = await rejection(
      createReservation(bob, { resourceId: roomId, start: "2030-01-16T01:00", end: "2030-01-16T03:00" }, NOW),
    );
    expect(error).toBeInstanceOf(ConflictError);
    await createReservation(bob, { resourceId: roomId, start: "2030-01-16T02:00", end: "2030-01-16T03:00" }, NOW);
  });

  it("lets a cancelled slot be booked again, keeping the cancelled row", async () => {
    const first = await book(alice, "09:00", "10:00");
    await cancelReservation(alice, first.id, NOW);
    const second = await book(bob, "09:00", "10:00");

    expect(second.status).toBe("CONFIRMED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("CANCELLED");
  });
});

describe("simultaneous booking requests", () => {
  it(
    "lets exactly one of many concurrent requests for the same slot succeed; the rest get a conflict",
    async () => {
      const users = [alice, bob, admin];
      const attempts = 9;
      const results = await Promise.allSettled(
        Array.from({ length: attempts }, (_, i) => book(users[i % users.length], "09:00", "10:00")),
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(attempts - 1);
      // Every loser gets the friendly conflict, never a raw 23P01/40P01 database error.
      for (const r of rejected) {
        expect(r.reason).toBeInstanceOf(ConflictError);
      }
      expect(await confirmedCount()).toBe(1);
    },
    30_000,
  );

  it(
    "lets two concurrent requests for different resources both succeed",
    async () => {
      const [a, b] = await Promise.allSettled([
        book(alice, "09:00", "10:00"),
        createReservation(bob, { resourceId: otherRoomId, start: "2030-01-15T09:00", end: "2030-01-15T10:00" }, NOW),
      ]);
      expect([a.status, b.status]).toEqual(["fulfilled", "fulfilled"]);
    },
    30_000,
  );
});

describe("cancelReservation", () => {
  it("lets the owner cancel, keeping the row as history", async () => {
    const reservation = await book(alice, "09:00", "10:00");
    const cancelled = await cancelReservation(alice, reservation.id, NOW);
    expect(cancelled.status).toBe("CANCELLED");
    expect(await prisma.reservation.count()).toBe(1);
  });

  it("forbids other users from cancelling, leaving the booking confirmed", async () => {
    const reservation = await book(alice, "09:00", "10:00");
    const error = await rejection(cancelReservation(bob, reservation.id, NOW));
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).status).toBe(403);
    expect(await confirmedCount()).toBe(1);
  });

  it("lets an admin cancel any booking", async () => {
    const reservation = await book(alice, "09:00", "10:00");
    expect((await cancelReservation(admin, reservation.id, NOW)).status).toBe("CANCELLED");
  });

  it("requires a signed-in user", async () => {
    const reservation = await book(alice, "09:00", "10:00");
    expect(await rejection(cancelReservation(null, reservation.id, NOW))).toBeInstanceOf(AuthError);
  });

  it("refuses to cancel twice, even concurrently", async () => {
    const reservation = await book(alice, "09:00", "10:00");
    const results = await Promise.allSettled([
      cancelReservation(alice, reservation.id, NOW),
      cancelReservation(alice, reservation.id, NOW),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(failed?.reason).toBeInstanceOf(ConflictError);
    expect((failed?.reason as Error).message).toBe("This booking is already cancelled.");
  });

  it("refuses to cancel a booking that has already ended", async () => {
    const reservation = await book(alice, "09:00", "10:00");
    const later = new Date("2030-01-15T05:00:00Z"); // 10:30 in Colombo
    expect(await rejection(cancelReservation(alice, reservation.id, later))).toBeInstanceOf(ConflictError);
  });

  it("reports unknown and malformed IDs as not found", async () => {
    expect(await rejection(cancelReservation(alice, "11111111-1111-4111-8111-111111111111", NOW))).toBeInstanceOf(NotFoundError);
    expect(await rejection(cancelReservation(alice, "nope", NOW))).toBeInstanceOf(NotFoundError);
  });
});

describe("listing reservations", () => {
  it("shows users only their own bookings, split into upcoming and history", async () => {
    const mine = await book(alice, "09:00", "10:00");
    const cancelled = await book(alice, "11:00", "12:00");
    await cancelReservation(alice, cancelled.id, NOW);
    await book(bob, "13:00", "14:00");
    const past = await prisma.reservation.create({
      data: { userId: alice.id, resourceId: roomId, startAt: new Date("2030-01-10T03:30Z"), endAt: new Date("2030-01-10T04:30Z") },
    });

    const { upcoming, history } = await listMyReservations(alice, NOW);
    expect(upcoming.map((r) => r.id)).toEqual([mine.id]);
    expect(history.map((r) => r.id)).toEqual([cancelled.id, past.id]);
    expect(upcoming[0].resource.name).toBe("Board Room");
  });

  it("lets admins list everyone's bookings, and forbids regular users", async () => {
    await book(alice, "09:00", "10:00");
    await book(bob, "10:00", "11:00");

    const { upcoming } = await listAllReservations(admin, NOW);
    expect(upcoming.map((r) => r.user.name)).toEqual(["Alice", "Bob"]);

    const error = await rejection(listAllReservations(alice, NOW));
    expect((error as AuthError).status).toBe(403);
  });
});
