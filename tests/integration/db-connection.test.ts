import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("database connection", () => {
  afterAll(() => prisma.$disconnect());

  it("connects to the isolated test database, not the demo database", async () => {
    const [row] = await prisma.$queryRaw<{ database: string }[]>`
      SELECT current_database() AS "database"`;

    expect(row.database).toMatch(/_test$/);
  });
});
