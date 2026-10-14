import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { Role } from "@/generated/prisma/client";

/** The only user data the app passes around after login. Never includes the password hash. */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

const sessionUserSelect = { id: true, name: true, email: true, role: true } as const;

// Compared against when the email is unknown, so a wrong email takes as long as a
// wrong password and response timing does not reveal which accounts exist.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("not-a-real-password");
  return dummyHash;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Returns the user for valid credentials, or null. Callers must not reveal which part was wrong. */
export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !passwordMatches) {
    return null;
  }
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/**
 * Loads the current state of a user from the database. Called on every request with
 * the ID from the session token, so role changes and deleted accounts take effect
 * immediately instead of when the token expires.
 */
export async function findSessionUser(userId: string): Promise<SessionUser | null> {
  if (!UUID_PATTERN.test(userId)) {
    return null;
  }
  return prisma.user.findUnique({ where: { id: userId }, select: sessionUserSelect });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
