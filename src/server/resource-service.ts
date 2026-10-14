import { prisma } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import type { Prisma } from "@/generated/prisma/client";
import { resourceFiltersSchema, resourceInputSchema, type ResourceFilters } from "@/schemas/resource";
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
