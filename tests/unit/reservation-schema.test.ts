import { describe, expect, it } from "vitest";
import { MAX_BOOKING_DAYS, reservationInputSchema } from "@/schemas/reservation";

const RESOURCE_ID = "00000000-0000-4000-a000-000000000001";
const START = "2030-01-15T09:00";
const END = "2030-01-15T10:00";

const input = (start: string, end: string, extra: Record<string, unknown> = {}) => ({
  resourceId: RESOURCE_ID,
  start,
  end,
  ...extra,
});

/** The fields a rejected input is reported on, e.g. ["end"]. */
function failedFields(value: unknown) {
  const result = reservationInputSchema.safeParse(value);
  expect(result.success).toBe(false);
  return result.error?.issues.map((issue) => issue.path[0]);
}

describe("reservationInputSchema", () => {
  it("reads datetime-local values as Asia/Colombo time", () => {
    const parsed = reservationInputSchema.parse(input("2030-01-15T09:00", "2030-01-15T10:30"));
    expect(parsed.start.toISOString()).toBe("2030-01-15T03:30:00.000Z");
    expect(parsed.end.toISOString()).toBe("2030-01-15T05:00:00.000Z");
  });

  it.each([
    ["one minute", "2030-01-15T09:00", "2030-01-15T09:01"],
    ["across midnight", "2030-01-15T23:00", "2030-01-16T01:00"],
    [`exactly ${MAX_BOOKING_DAYS} days`, "2030-01-15T09:00", "2030-01-29T09:00"],
  ])("accepts a booking lasting %s", (_label, start, end) => {
    expect(reservationInputSchema.safeParse(input(start, end)).success).toBe(true);
  });

  it.each([
    ["ends before it starts", "2030-01-15T10:00", "2030-01-15T09:00", "End must be after the start."],
    ["has zero length", "2030-01-15T10:00", "2030-01-15T10:00", "End must be after the start."],
    ["is one minute too long", "2030-01-15T09:00", "2030-01-29T09:01", "A booking can last at most 14 days."],
  ])("rejects a booking that %s, on the end field", (_label, start, end, message) => {
    const result = reservationInputSchema.safeParse(input(start, end));
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: ["end"], message })]);
  });

  it.each([
    ["2030-02-30T09:00", "impossible date"],
    ["2030-01-15T24:00", "hour out of range"],
    ["2030-01-15 09:00", "space instead of T"],
    ["2030-01-15T09:00:00", "seconds"],
    ["2030-01-15T09:00Z", "explicit time zone"],
  ])("rejects start %j (%s) on the start field only", (start) => {
    expect(failedFields(input(start, END))).toEqual(["start"]);
  });

  it("requires a resource ID that is a UUID", () => {
    expect(failedFields(input(START, END, { resourceId: "board-room" }))).toEqual(["resourceId"]);
  });

  it("trims the purpose, stores a blank one as null and limits it to 200 characters", () => {
    expect(reservationInputSchema.parse(input(START, END, { purpose: "  Planning  " })).purpose).toBe("Planning");
    expect(reservationInputSchema.parse(input(START, END, { purpose: "   " })).purpose).toBeNull();
    expect(reservationInputSchema.parse(input(START, END)).purpose).toBeNull();
    expect(reservationInputSchema.safeParse(input(START, END, { purpose: "x".repeat(200) })).success).toBe(true);
    expect(failedFields(input(START, END, { purpose: "x".repeat(201) }))).toEqual(["purpose"]);
  });

  it("drops fields that are not part of the form, such as userId and status", () => {
    const parsed = reservationInputSchema.parse(input(START, END, { userId: "someone-else", status: "CANCELLED" }));
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("status");
  });
});
