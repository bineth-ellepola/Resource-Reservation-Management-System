import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("timestamp storage", () => {
  afterAll(() => prisma.$disconnect());

  it("pins the application session to UTC", async () => {
    const [row] = await prisma.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`;
    expect(row.tz).toBe("UTC");
  });

  it("stores the exact instant passed from JavaScript", async () => {
    // 09:00 in Asia/Colombo. Read back as epoch seconds computed by PostgreSQL itself,
    // so a session time zone mismatch cannot be hidden by a symmetric read-back error.
    const instant = new Date("2026-10-15T03:30:00.000Z");
    const [row] = await prisma.$queryRaw<{ epoch: number }[]>`
      SELECT extract(epoch FROM ${instant}::timestamptz)::float8 AS epoch`;
    expect(row.epoch * 1000).toBe(instant.getTime());
  });
});
