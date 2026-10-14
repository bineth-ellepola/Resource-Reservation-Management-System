import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  // The pg adapter sends timestamps as UTC text without an offset, which PostgreSQL
  // interprets in the session time zone. Pin the session to UTC so stored instants are
  // correct even when the server's default time zone is local (e.g. Asia/Colombo).
  const adapter = new PrismaPg({ connectionString, options: "-c TimeZone=UTC" });
  return new PrismaClient({ adapter });
}

// Reuse one client across Next.js dev hot reloads; otherwise every reload
// would open a new connection pool and eventually exhaust PostgreSQL connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
