import { SignJWT, jwtVerify } from "jose";

// Session tokens are signed (HS256), not encrypted: they hold only the user ID
// ("sub"), which is not sensitive. The role is deliberately not stored here; it is
// read from the database on every request so changes apply immediately.
export const SESSION_DURATION_SECONDS = 8 * 60 * 60;

const ALGORITHM = "HS256";
const MIN_SECRET_LENGTH = 32;

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters. See .env.example.`);
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

/** Returns the user ID from a valid token, or null if it is missing, tampered with or expired. */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) {
    return null;
  }
  try {
    // Pinning the algorithm rejects unsigned ("alg": "none") and other-algorithm tokens.
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: [ALGORITHM] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
