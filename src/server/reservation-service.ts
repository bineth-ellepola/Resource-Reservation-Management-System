import { prisma } from "@/lib/db";
import { formatColomboRange } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { reservationInputSchema } from "@/schemas/reservation";
import type { SessionUser } from "@/server/auth-service";
import { assertAdmin, assertAuthenticated, assertCanManageReservation } from "@/server/authz";
import { isBookingConflict } from "@/server/db-errors";
import { ConflictError, NotFoundError, ValidationError, parseInput } from "@/server/errors";

const HISTORY_LIMIT = 50;

const reservationInclude = {
  resource: { select: { id: true, name: true, location: true, isActive: true } },
  user: { select: { id: true, name: true, email: true } },
} as const;

/**
 * Books a resource for the signed-in user.
 *
 * The checks here give helpful errors, but they are not what prevents double booking:
 * the insert itself is guarded by the PostgreSQL exclusion constraint, which is atomic
 * even when two requests arrive at the same moment.
 */
export async function createReservation(actor: SessionUser | null, input: unknown, now: Date = new Date()) {
  assertAuthenticated(actor);
  const { resourceId, start, end, purpose } = parseInput(reservationInputSchema, input);

  if (start <= now) {
    throw new ValidationError({ start: ["The start must be in the future."] });
  }

  const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
  if (!resource) {
    throw new ValidationError({ resourceId: ["That resource does not exist."] });
  }
  if (!resource.isActive) {
    throw new ValidationError({ resourceId: ["This resource is inactive and cannot be booked."] });
  }

  try {
    return await prisma.reservation.create({
      data: { userId: actor.id, resourceId, startAt: start, endAt: end, purpose, status: "CONFIRMED" },
      include: reservationInclude,
    });
  } catch (error) {
    if (isBookingConflict(error)) {
      throw new ConflictError(await describeConflict(resourceId, resource.name, start, end));
    }
    throw error;
  }
}

/** Builds a conflict message naming the clashing slots (never who booked them). */
async function describeConflict(resourceId: string, resourceName: string, start: Date, end: Date): Promise<string> {
  // Interval intersection for half-open ranges: existing.start < new.end AND existing.end > new.start.
  const clashes = await prisma.reservation.findMany({
    where: { resourceId, status: "CONFIRMED", startAt: { lt: end }, endAt: { gt: start } },
    orderBy: { startAt: "asc" },
    take: 3,
    select: { startAt: true, endAt: true },
  });
  const taken = clashes.map((c) => formatColomboRange(c.startAt, c.endAt)).join("; ");
  return `${resourceName} is already booked for part of that time${taken ? ` (${taken})` : ""}. Please choose another time.`;
}

/**
 * Cancels a reservation. The row is kept with status CANCELLED for history, and the
 * exclusion constraint ignores cancelled rows, so the slot becomes free immediately.
 */
export async function cancelReservation(actor: SessionUser | null, reservationId: string, now: Date = new Date()) {
  assertAuthenticated(actor);
  const reservation = isUuid(reservationId)
    ? await prisma.reservation.findUnique({ where: { id: reservationId } })
    : null;
  if (!reservation) {
    throw new NotFoundError("Reservation not found.");
  }
  assertCanManageReservation(actor, reservation.userId);

  if (reservation.endAt <= now) {
    throw new ConflictError("This booking has already ended and can no longer be cancelled.");
  }

  // Conditional update: if two cancel requests race, only one changes the row.
  const { count } = await prisma.reservation.updateMany({
    where: { id: reservationId, status: "CONFIRMED" },
    data: { status: "CANCELLED" },
  });
  if (count === 0) {
    throw new ConflictError("This booking is already cancelled.");
  }
  return prisma.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: reservationInclude });
}

/** The signed-in user's bookings: upcoming confirmed ones, and history (past or cancelled). */
export async function listMyReservations(actor: SessionUser | null, now: Date = new Date()) {
  assertAuthenticated(actor);
  return listReservations({ userId: actor.id }, now);
}

/** Every user's bookings. Admin only. */
export async function listAllReservations(actor: SessionUser | null, now: Date = new Date()) {
  assertAdmin(actor);
  return listReservations({}, now);
}

async function listReservations(where: { userId?: string }, now: Date) {
  const [upcoming, history] = await Promise.all([
    prisma.reservation.findMany({
      where: { ...where, status: "CONFIRMED", endAt: { gt: now } },
      orderBy: { startAt: "asc" },
      include: reservationInclude,
    }),
    prisma.reservation.findMany({
      where: { ...where, OR: [{ status: "CANCELLED" }, { endAt: { lte: now } }] },
      orderBy: { startAt: "desc" },
      take: HISTORY_LIMIT,
      include: reservationInclude,
    }),
  ]);
  return { upcoming, history };
}
