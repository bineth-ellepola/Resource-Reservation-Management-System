import bcrypt from "bcryptjs";

// Cost 12 is roughly 250ms per hash: slow enough to resist offline guessing,
// fast enough for an interactive login.
const BCRYPT_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
