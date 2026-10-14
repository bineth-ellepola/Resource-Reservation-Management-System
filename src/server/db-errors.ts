// PostgreSQL error detection. With @prisma/adapter-pg, a constraint violation arrives as
// PrismaClientKnownRequestError with the generic code P2039, and the real SQLSTATE is in
// meta.driverAdapterError.cause.originalCode. Raw `pg` errors carry it in `code`.

export const PG_EXCLUSION_VIOLATION = "23P01";
export const PG_DEADLOCK_DETECTED = "40P01";

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

type ErrorLike = {
  name?: unknown;
  code?: unknown;
  meta?: { driverAdapterError?: { cause?: { originalCode?: unknown; code?: unknown } } };
};

export function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const { name, code, meta } = error as ErrorLike;
  const adapterCause = meta?.driverAdapterError?.cause;
  // Prisma's own codes (P2039, P2025, ...) look like SQLSTATEs, so a top-level `code`
  // is only trusted on non-Prisma errors, i.e. raw `pg` errors.
  const isPrismaError = typeof name === "string" && name.startsWith("Prisma");
  const candidates = [adapterCause?.originalCode, adapterCause?.code, isPrismaError ? undefined : code];
  return candidates.find((value): value is string => typeof value === "string" && SQLSTATE_PATTERN.test(value));
}

/**
 * True when PostgreSQL refused a booking because the slot is taken: the exclusion
 * constraint fired (23P01), or several concurrent inserts for the same slot were
 * resolved by the deadlock detector (40P01). Either way no overlapping booking was stored.
 */
export function isBookingConflict(error: unknown): boolean {
  const code = postgresErrorCode(error);
  return code === PG_EXCLUSION_VIOLATION || code === PG_DEADLOCK_DETECTED;
}
