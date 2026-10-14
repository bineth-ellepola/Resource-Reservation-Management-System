import { describe, expect, it } from "vitest";
import {
  addDays,
  colomboDateString,
  colomboDateTime,
  formatColomboRange,
  parseColomboDateTimeLocal,
  startOfNextColomboHour,
  toColomboDateTimeLocal,
} from "@/lib/dates";

describe("colomboDateTime", () => {
  it("converts Colombo wall-clock time to the correct UTC instant", () => {
    expect(colomboDateTime("2026-10-15", "09:00").toISOString()).toBe("2026-10-15T03:30:00.000Z");
  });

  it("handles times that fall on the previous UTC day", () => {
    expect(colomboDateTime("2026-10-15", "02:00").toISOString()).toBe("2026-10-14T20:30:00.000Z");
  });

  it.each([
    ["2026-02-30", "09:00"],
    ["2026-10-15", "24:00"],
    ["2026-10-15", "9:00"],
    ["15/10/2026", "09:00"],
  ])("rejects invalid input %s %s", (date, time) => {
    expect(() => colomboDateTime(date, time)).toThrow(RangeError);
  });
});

describe("colomboDateString", () => {
  it("uses the Colombo calendar date, not the UTC date", () => {
    // 20:00 UTC on the 14th is 01:30 on the 15th in Colombo.
    expect(colomboDateString(new Date("2026-10-14T20:00:00Z"))).toBe("2026-10-15");
  });
});

describe("formatColomboRange", () => {
  it("formats a same-day interval in Colombo time", () => {
    // 03:30Z-04:30Z is 09:00-10:00 in Colombo.
    expect(formatColomboRange(new Date("2026-10-15T03:30:00Z"), new Date("2026-10-15T04:30:00Z"))).toBe(
      "Thu 15 Oct 2026, 09:00–10:00",
    );
  });

  it("shows both dates when the interval crosses midnight in Colombo", () => {
    expect(formatColomboRange(new Date("2026-10-15T16:30:00Z"), new Date("2026-10-15T20:30:00Z"))).toBe(
      "Thu 15 Oct 2026, 22:00 – Fri 16 Oct 2026, 02:00",
    );
  });

  it("uses the Colombo date even when the UTC date differs", () => {
    // 20:00Z on the 14th is already 01:30 on the 15th in Colombo.
    expect(formatColomboRange(new Date("2026-10-14T20:00:00Z"), new Date("2026-10-14T21:00:00Z"))).toBe(
      "Thu 15 Oct 2026, 01:30–02:30",
    );
  });

  it("shows midnight as 00:00, not 24:00", () => {
    expect(formatColomboRange(new Date("2026-10-14T18:30:00Z"), new Date("2026-10-14T19:30:00Z"))).toBe(
      "Thu 15 Oct 2026, 00:00–01:00",
    );
  });
});

describe("datetime-local values", () => {
  it("parses as Asia/Colombo time", () => {
    expect(parseColomboDateTimeLocal("2026-10-15T09:00")?.toISOString()).toBe("2026-10-15T03:30:00.000Z");
  });

  it.each(["", "2026-10-15", "2026-10-15 09:00", "2026-10-15T09:00:00", "2026-02-30T09:00", "2026-10-15T25:00"])(
    "rejects %j",
    (value) => {
      expect(parseColomboDateTimeLocal(value)).toBeNull();
    },
  );

  it("formats an instant back to a Colombo datetime-local value", () => {
    expect(toColomboDateTimeLocal(new Date("2026-10-14T20:00:00Z"))).toBe("2026-10-15T01:30");
  });
});

describe("startOfNextColomboHour", () => {
  it("rounds up to the next full hour on the Colombo clock, not the UTC clock", () => {
    // 03:47Z is 09:17 in Colombo; the next Colombo hour is 10:00 = 04:30Z.
    expect(startOfNextColomboHour(new Date("2026-10-15T03:47:00Z")).toISOString()).toBe("2026-10-15T04:30:00.000Z");
  });

  it("moves to the next day after 23:00", () => {
    // 18:00Z is 23:30 in Colombo; next hour is 00:00 on the 16th.
    expect(toColomboDateTimeLocal(startOfNextColomboHour(new Date("2026-10-15T18:00:00Z")))).toBe("2026-10-16T00:00");
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
});
