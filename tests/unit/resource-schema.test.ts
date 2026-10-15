import { describe, expect, it } from "vitest";
import { MAX_CAPACITY, availabilityQuerySchema, resourceFiltersSchema, resourceInputSchema } from "@/schemas/resource";

const valid = { name: "Board Room", type: "MEETING_ROOM", location: "Level 2", capacity: "12" };

describe("resourceInputSchema", () => {
  it("trims text and converts the capacity from form text to a number", () => {
    expect(resourceInputSchema.parse({ ...valid, name: "  Board Room  ", location: " Level 2 " })).toEqual({
      name: "Board Room",
      type: "MEETING_ROOM",
      location: "Level 2",
      capacity: 12,
    });
  });

  it.each([
    ["1", 1],
    [String(MAX_CAPACITY), MAX_CAPACITY],
  ])("accepts capacity %s at the boundary", (capacity, expected) => {
    expect(resourceInputSchema.parse({ ...valid, capacity }).capacity).toBe(expected);
  });

  it("accepts a 100-character name and a 150-character location", () => {
    expect(resourceInputSchema.safeParse({ ...valid, name: "n".repeat(100), location: "l".repeat(150) }).success).toBe(true);
  });

  it.each([
    ["name", { name: "n".repeat(101) }, "Name must be 100 characters or fewer."],
    ["location", { location: "l".repeat(151) }, "Location must be 150 characters or fewer."],
    ["type", { type: "SPACESHIP" }, "Choose a resource type."],
    ["type", { type: undefined }, "Choose a resource type."],
  ])("rejects an invalid %s with a clear message", (field, change, message) => {
    const result = resourceInputSchema.safeParse({ ...valid, ...change });
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: [field], message })]);
  });
});

describe("resourceFiltersSchema", () => {
  it("shows active resources by default", () => {
    expect(resourceFiltersSchema.parse({})).toEqual({ status: "active" });
  });

  it("falls back to defaults for unknown or repeated URL values instead of failing", () => {
    expect(resourceFiltersSchema.parse({ q: ["a", "b"], type: "SPACESHIP", status: "deleted" })).toEqual({ status: "active" });
  });
});

describe("availabilityQuerySchema", () => {
  it("keeps a well-formed date and view", () => {
    expect(availabilityQuerySchema.parse({ date: "2030-01-15", view: "week" })).toEqual({ date: "2030-01-15", view: "week" });
  });

  it("ignores malformed values, so a bad link still shows today's day view", () => {
    expect(availabilityQuerySchema.parse({ date: "15/01/2030", view: "month" })).toEqual({ view: "day" });
  });
});
