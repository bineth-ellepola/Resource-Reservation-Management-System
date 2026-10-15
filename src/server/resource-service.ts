import { prisma } from "@/lib/db";
import { buildSchedule } from "@/lib/availability";
import { addDays, colomboDateString, colomboDateTime } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import type { Prisma } from "@/generated/prisma/client";
import {
  availabilityQuerySchema,
  resourceFiltersSchema,
  resourceInputSchema,
  type ResourceFilters,
} from "@/schemas/resource";
import type { SessionUser } from "@/server/auth-service";
import { assertAdmin, assertAuthenticated } from "@/server/authz";
import { NotFoundError, parseInput } from "@/server/errors";

const UPCOMING_LIMIT = 20;

/** Lists resources. Regular users only ever see active ones, whatever filter they send. */
export async function listResources(actor: SessionUser | null, rawFilters: unknown = {}) {
  assertAuthenticated(actor);
  const filters: ResourceFilters = resourceFiltersSchema.parse(rawFilters);
  const status = actor.role === "ADMIN" ? filters.status : "active";

  const where: Prisma.ResourceWhereInput = {
    ...(status !== "all" && { isActive: status === "active" }),
    ...(filters.type && { type: filters.type }),
    ...(filters.q && {
      OR: [
        { name: { contains: filters.q, mode: "insensitive" } },
        { location: { contains: filters.q, mode: "insensitive" } },
      ],
    }),
  };

  return prisma.resource.findMany({ where, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
}

/**
 * A resource with its upcoming confirmed reservations. Inactive resources are hidden
 * from regular users. Booker names and purposes are only shown to admins and the booker.
 */
export async function getResourceDetails(actor: SessionUser | null, resourceId: string, now: Date = new Date()) {
  assertAuthenticated(actor);
  const resource = await findVisibleResource(actor, resourceId);

  const reservations = await prisma.reservation.findMany({
    where: { resourceId, status: "CONFIRMED", endAt: { gt: now } },
    orderBy: { startAt: "asc" },
    take: UPCOMING_LIMIT,
    include: { user: { select: { name: true } } },
  });

  const isAdmin = actor.role === "ADMIN";
  const upcoming = reservations.map((reservation) => {
    const isMine = reservation.userId === actor.id;
    const canSeeDetails = isAdmin || isMine;
    return {
      id: reservation.id,
      startAt: reservation.startAt,
      endAt: reservation.endAt,
      isMine,
      bookedBy: canSeeDetails ? reservation.user.name : null,
      purpose: canSeeDetails ? reservation.purpose : null,
    };
  });

  return { resource, upcoming };
}

/**
 * Free/booked schedule of a resource for one Colombo day or seven days from `date`.
 * Uses the interval-intersection rule for half-open ranges, so bookings that cross
 * midnight or the window edges are included and then clipped per day.
 */
export async function getResourceAvailability(
  actor: SessionUser | null,
  resourceId: string,
  rawQuery: unknown = {},
  now: Date = new Date(),
) {
  assertAuthenticated(actor);
  const resource = await findVisibleResource(actor, resourceId);
  const query = availabilityQuerySchema.parse(rawQuery);

  let firstDay = query.date ?? colomboDateString(now);
  try {
    colomboDateTime(firstDay, "00:00");
  } catch {
    firstDay = colomboDateString(now); // e.g. 2026-02-30
  }
  const dayCount = query.view === "week" ? 7 : 1;
  const days = Array.from({ length: dayCount }, (_, i) => addDays(firstDay, i));
  const windowStart = colomboDateTime(days[0], "00:00");
  const windowEnd = colomboDateTime(addDays(firstDay, dayCount), "00:00");

  const reservations = await prisma.reservation.findMany({
    where: { resourceId, status: "CONFIRMED", startAt: { lt: windowEnd }, endAt: { gt: windowStart } },
    orderBy: { startAt: "asc" },
    include: { user: { select: { name: true } } },
  });

  const isAdmin = actor.role === "ADMIN";
  const bookings = reservations.map((r) => {
    const isMine = r.userId === actor.id;
    return { start: r.startAt, end: r.endAt, isMine, bookedBy: isAdmin || isMine ? r.user.name : null };
  });

  return {
    resource,
    view: query.view,
    firstDay,
    previousDay: addDays(firstDay, -dayCount),
    nextDay: addDays(firstDay, dayCount),
    today: colomboDateString(now),
    days: days.map((date) => ({
      date,
      segments: buildSchedule(colomboDateTime(date, "00:00"), colomboDateTime(addDays(date, 1), "00:00"), bookings),
    })),
  };
}

/** For the edit form. Admin only. */
export async function getResourceForEdit(actor: SessionUser | null, resourceId: string) {
  assertAdmin(actor);
  return findVisibleResource(actor, resourceId);
}

export async function createResource(actor: SessionUser | null, input: unknown) {
  assertAdmin(actor);
  const data = parseInput(resourceInputSchema, input);
  return prisma.resource.create({ data });
}

export async function updateResource(actor: SessionUser | null, resourceId: string, input: unknown) {
  assertAdmin(actor);
  const data = parseInput(resourceInputSchema, input);
  await findVisibleResource(actor, resourceId);
  return prisma.resource.update({ where: { id: resourceId }, data });
}

/**
 * Deactivates or reactivates a resource. Resources are never deleted, so booking history
 * is kept. Existing reservations are untouched; new bookings require an active resource.
 */
export async function setResourceActive(actor: SessionUser | null, resourceId: string, isActive: boolean) {
  assertAdmin(actor);
  await findVisibleResource(actor, resourceId);
  return prisma.resource.update({ where: { id: resourceId }, data: { isActive } });
}

async function findVisibleResource(actor: SessionUser, resourceId: string) {
  const resource = isUuid(resourceId) ? await prisma.resource.findUnique({ where: { id: resourceId } }) : null;
  if (!resource || (!resource.isActive && actor.role !== "ADMIN")) {
    throw new NotFoundError("Resource not found.");
  }
  return resource;
}
