// Verifies that DATABASE_URL reaches PostgreSQL through the app's Prisma client.
// Usage: npm run db:check
import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const [row] = await prisma.$queryRaw<{ user: string; database: string; version: string }[]>`
    SELECT current_user AS "user",
           current_database() AS "database",
           current_setting('server_version') AS "version"`;
  console.log(`Connected as ${row.user} to ${row.database} (PostgreSQL ${row.version})`);
}

main()
  .catch((error: unknown) => {
    console.error("Database connection failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
