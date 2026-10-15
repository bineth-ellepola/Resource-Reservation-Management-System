import { describe, expect, it } from "vitest";
import { buildSchedule, suggestSlot, type Segment } from "@/lib/availability";
import { colomboDateTime } from "@/lib/dates";

// A Colombo day: 15 Oct 2026 00:00 to 16 Oct 2026 00:00 (Asia/Colombo).
const DAY_START = colomboDateTime("2026-10-15", "00:00");
const DAY_END = colomboDateTime("2026-10-16", "00:00");
const at = (date: string, time: string) => colomboDateTime(date, time);
const booking = (id: string, start: Date, end: Date) => ({ id, start, end });

/** Compact view: "free 00:00-09:00" style strings in Colombo time. */
function describe_(segments: Segment<{ id: string }>[]) {
  const hhmm = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return segments.map((s) => `${s.kind === "booked" ? `booked(${s.booking.id})` : "free"} ${hhmm(s.start)}-${hhmm(s.end)}`);
}

describe("buildSchedule", () => {
  it("returns one free segment for a day without bookings", () => {
    expect(describe_(buildSchedule(DAY_START, DAY_END, []))).toEqual(["free 00:00-00:00"]);
  });

  it("alternates free and booked segments, sorting bookings by start", () => {
    const later = booking("b", at("2026-10-15", "13:00"), at("2026-10-15", "14:00"));
    const earlier = booking("a", at("2026-10-15", "09:00"), at("2026-10-15", "10:00"));
    expect(describe_(buildSchedule(DAY_START, DAY_END, [later, earlier]))).toEqual([
      "free 00:00-09:00",
      "booked(a) 09:00-10:00",
      "free 10:00-13:00",
      "booked(b) 13:00-14:00",
      "free 14:00-00:00",
    ]);
  });

  it("leaves no free gap between back-to-back bookings", () => {
    const a = booking("a", at("2026-10-15", "09:00"), at("2026-10-15", "10:00"));
    const b = booking("b", at("2026-10-15", "10:00"), at("2026-10-15", "11:00"));
    expect(describe_(buildSchedule(DAY_START, DAY_END, [a, b]))).toEqual([
      "free 00:00-09:00",
      "booked(a) 09:00-10:00",
      "booked(b) 10:00-11:00",
      "free 11:00-00:00",
    ]);
  });

  it("clips a booking that started the previous evening (crosses midnight into the day)", () => {
    const overnight = booking("n", at("2026-10-14", "22:00"), at("2026-10-15", "02:00"));
    expect(describe_(buildSchedule(DAY_START, DAY_END, [overnight]))).toEqual(["booked(n) 00:00-02:00", "free 02:00-00:00"]);
  });

  it("clips a booking that runs past midnight out of the day", () => {
    const overnight = booking("n", at("2026-10-15", "22:00"), at("2026-10-16", "02:00"));
    const segments = buildSchedule(DAY_START, DAY_END, [overnight]);
    expect(describe_(segments)).toEqual(["free 00:00-22:00", "booked(n) 22:00-00:00"]);
    expect(segments[1].end).toEqual(DAY_END);
  });

  it("covers the whole day with one segment for a multi-day booking", () => {
    const longBooking = booking("v", at("2026-10-14", "08:00"), at("2026-10-17", "17:00"));
    expect(describe_(buildSchedule(DAY_START, DAY_END, [longBooking]))).toEqual(["booked(v) 00:00-00:00"]);
  });

  it("ignores bookings that only touch the window edges (half-open ranges)", () => {
    const endsAtStart = booking("x", at("2026-10-14", "23:00"), DAY_START);
    const startsAtEnd = booking("y", DAY_END, at("2026-10-16", "01:00"));
    expect(describe_(buildSchedule(DAY_START, DAY_END, [endsAtStart, startsAtEnd]))).toEqual(["free 00:00-00:00"]);
  });

  it("always covers the window exactly, without gaps or overlaps", () => {
    const bookings = [
      booking("a", at("2026-10-14", "23:00"), at("2026-10-15", "01:00")),
      booking("b", at("2026-10-15", "12:00"), at("2026-10-15", "12:30")),
      booking("c", at("2026-10-15", "23:30"), at("2026-10-16", "00:30")),
    ];
    const segments = buildSchedule(DAY_START, DAY_END, bookings);
    expect(segments[0].start).toEqual(DAY_START);
    expect(segments.at(-1)?.end).toEqual(DAY_END);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].start).toEqual(segments[i - 1].end);
    }
  });
});

describe("suggestSlot", () => {
  const free = { start: at("2026-10-15", "09:00"), end: at("2026-10-15", "12:00") };

  it("suggests the first hour of a future free segment", () => {
    expect(suggestSlot(free, at("2026-10-15", "07:00"))).toEqual({ start: at("2026-10-15", "09:00"), end: at("2026-10-15", "10:00") });
  });

  it("starts no earlier than the earliest allowed start", () => {
    expect(suggestSlot(free, at("2026-10-15", "10:00"))).toEqual({ start: at("2026-10-15", "10:00"), end: at("2026-10-15", "11:00") });
  });

  it("shortens the slot to fit a short gap", () => {
    expect(suggestSlot(free, at("2026-10-15", "11:30"))).toEqual({ start: at("2026-10-15", "11:30"), end: at("2026-10-15", "12:00") });
  });

  it("returns null when the free segment is over", () => {
    expect(suggestSlot(free, at("2026-10-15", "12:00"))).toBeNull();
  });
});
