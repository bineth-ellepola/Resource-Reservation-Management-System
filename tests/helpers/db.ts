import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { Role } from "@/generated/prisma/client";

/** Empties all application tables in the test database (guarded by tests/setup.ts). */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRaw`TRUNCATE "Reservation", "Resource", "User" CASCADE`;
}

export async function createUser({
  email,
  password = "Correct-Horse-1",
  role = "USER",
  name = "Test User",
}: {
  email: string;
  password?: string;
  role?: Role;
  name?: string;
}) {
  return prisma.user.create({
    data: { email, name, role, passwordHash: await hashPassword(password) },
  });
}
