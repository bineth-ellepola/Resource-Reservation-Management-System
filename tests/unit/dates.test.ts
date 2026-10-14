import { describe, expect, it } from "vitest";
import { addDays, colomboDateString, colomboDateTime } from "@/lib/dates";

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

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
});
