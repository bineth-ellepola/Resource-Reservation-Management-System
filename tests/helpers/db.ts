import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { ResourceType, Role } from "@/generated/prisma/client";
import type { SessionUser } from "@/server/auth-service";

export function toSessionUser(user: { id: string; name: string; email: string; role: Role }): SessionUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function insertResource({
  name = "Room",
  type = "MEETING_ROOM",
  location = "Level 1",
  capacity = 10,
  isActive = true,
}: { name?: string; type?: ResourceType; location?: string; capacity?: number; isActive?: boolean } = {}) {
  return prisma.resource.create({ data: { name, type, location, capacity, isActive } });
}

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
