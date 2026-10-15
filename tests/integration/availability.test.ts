import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { colomboDateTime, formatColomboTime } from "@/lib/dates";
import type { SessionUser } from "@/server/auth-service";
import { NotFoundError } from "@/server/errors";
import { getResourceAvailability } from "@/server/resource-service";
import { createUser, insertResource, resetDatabase, toSessionUser } from "../helpers/db";

const NOW = colomboDateTime("2030-01-15", "08:00");

let admin: SessionUser;
let alice: SessionUser;
let bob: SessionUser;
let roomId: string;

beforeEach(async () => {
  await resetDatabase();
  admin = toSessionUser(await createUser({ email: "admin@example.com", role: "ADMIN", name: "Admin" }));
  alice = toSessionUser(await createUser({ email: "alice@example.com", name: "Alice" }));
  bob = toSessionUser(await createUser({ email: "bob@example.com", name: "Bob" }));
  roomId = (await insertResource({ name: "Board Room" })).id;
});

afterAll(() => prisma.$disconnect());

const reserve = (user: SessionUser, start: [string, string], end: [string, string], status: "CONFIRMED" | "CANCELLED" = "CONFIRMED") =>
  prisma.reservation.create({
    data: { userId: user.id, resourceId: roomId, startAt: colomboDateTime(...start), endAt: colomboDateTime(...end), status },
  });

type Day = Awaited<ReturnType<typeof getResourceAvailability>>["days"][number];
const summary = (day: Day) =>
  day.segments.map((s) => `${s.kind} ${formatColomboTime(s.start)}-${formatColomboTime(s.end)}`);

describe("getResourceAvailability", () => {
  it("shows today as a single free segment when nothing is booked", async () => {
    const result = await getResourceAvailability(alice, roomId, {}, NOW);
    expect(result.firstDay).toBe("2030-01-15");
    expect(result.days).toHaveLength(1);
    expect(summary(result.days[0])).toEqual(["free 00:00-00:00"]);
  });

  it("includes a booking that crosses midnight on both days, clipped at midnight", async () => {
    await reserve(alice, ["2030-01-15", "22:00"], ["2030-01-16", "02:00"]);

    const first = await getResourceAvailability(alice, roomId, { date: "2030-01-15" }, NOW);
    expect(summary(first.days[0])).toEqual(["free 00:00-22:00", "booked 22:00-00:00"]);

    const second = await getResourceAvailability(alice, roomId, { date: "2030-01-16" }, NOW);
    expect(summary(second.days[0])).toEqual(["booked 00:00-02:00", "free 02:00-00:00"]);
  });

  it("excludes bookings that only touch the window edges", async () => {
    await reserve(alice, ["2030-01-14", "23:00"], ["2030-01-15", "00:00"]);
    await reserve(alice, ["2030-01-16", "00:00"], ["2030-01-16", "01:00"]);
    const result = await getResourceAvailability(alice, roomId, { date: "2030-01-15" }, NOW);
    expect(summary(result.days[0])).toEqual(["free 00:00-00:00"]);
  });

  it("ignores cancelled bookings", async () => {
    await reserve(alice, ["2030-01-15", "09:00"], ["2030-01-15", "10:00"], "CANCELLED");
    const result = await getResourceAvailability(alice, roomId, {}, NOW);
    expect(summary(result.days[0])).toEqual(["free 00:00-00:00"]);
  });

  it("returns seven days for the week view, with navigation dates", async () => {
    await reserve(bob, ["2030-01-17", "09:00"], ["2030-01-17", "10:00"]);
    const result = await getResourceAvailability(alice, roomId, { date: "2030-01-15", view: "week" }, NOW);

    expect(result.days.map((d) => d.date)).toEqual([
      "2030-01-15", "2030-01-16", "2030-01-17", "2030-01-18", "2030-01-19", "2030-01-20", "2030-01-21",
    ]);
    expect(summary(result.days[2])).toEqual(["free 00:00-09:00", "booked 09:00-10:00", "free 10:00-00:00"]);
    expect([result.previousDay, result.nextDay]).toEqual(["2030-01-08", "2030-01-22"]);
  });

  it("names the booker only for admins and the booker", async () => {
    await reserve(bob, ["2030-01-15", "09:00"], ["2030-01-15", "10:00"]);
    const booked = (day: Day) => day.segments.find((s) => s.kind === "booked");

    const forAlice = booked((await getResourceAvailability(alice, roomId, {}, NOW)).days[0]);
    const forBob = booked((await getResourceAvailability(bob, roomId, {}, NOW)).days[0]);
    const forAdmin = booked((await getResourceAvailability(admin, roomId, {}, NOW)).days[0]);

    expect(forAlice?.kind === "booked" && forAlice.booking).toEqual(expect.objectContaining({ isMine: false, bookedBy: null }));
    expect(forBob?.kind === "booked" && forBob.booking).toEqual(expect.objectContaining({ isMine: true, bookedBy: "Bob" }));
    expect(forAdmin?.kind === "booked" && forAdmin.booking).toEqual(expect.objectContaining({ bookedBy: "Bob" }));
  });

  it.each([{ date: "2030-02-30" }, { date: "yesterday" }, { date: ["2030-01-20", "x"] }, { view: "month" }])(
    "falls back to today's day view for invalid params %j",
    async (query) => {
      const result = await getResourceAvailability(alice, roomId, query, NOW);
      expect(result.firstDay).toBe("2030-01-15");
      expect(result.view).toBe("day");
    },
  );

  it("hides inactive resources from regular users", async () => {
    await prisma.resource.update({ where: { id: roomId }, data: { isActive: false } });
    await expect(getResourceAvailability(alice, roomId, {}, NOW)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getResourceAvailability(admin, roomId, {}, NOW)).resource.isActive).toBe(false);
  });
});
