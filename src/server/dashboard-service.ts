import { prisma } from "@/lib/db";
import { addDays, colomboDateString, colomboDateTime } from "@/lib/dates";
import type { SessionUser } from "@/server/auth-service";
import { assertAuthenticated } from "@/server/authz";

const UPCOMING_LIMIT = 5;

const upcomingInclude = {
  resource: { select: { id: true, name: true, location: true } },
  user: { select: { name: true } },
} as const;

/**
 * Numbers and upcoming bookings for the dashboard.
 *
 * "Upcoming" means confirmed and not yet ended (endAt > now), the same rule as the
 * bookings page, so a booking in progress still counts. "Today" is the current
 * Asia/Colombo calendar day. Regular users only see their own bookings; admins also
 * get system-wide counts, a status breakdown and the next bookings across all users.
 */
export async function getDashboardSummary(actor: SessionUser | null, now: Date = new Date()) {
  assertAuthenticated(actor);

  const today = colomboDateString(now);
  const todayStart = colomboDateTime(today, "00:00");
  const tomorrowStart = colomboDateTime(addDays(today, 1), "00:00");
  const upcomingWhere = { status: "CONFIRMED" as const, endAt: { gt: now } };
  // Half-open interval intersection with today, so bookings crossing midnight count on both days.
  const todayWhere = { status: "CONFIRMED" as const, startAt: { lt: tomorrowStart }, endAt: { gt: todayStart } };

  const [activeResources, myUpcomingCount, myTodayCount, myUpcoming] = await Promise.all([
    prisma.resource.count({ where: { isActive: true } }),
    prisma.reservation.count({ where: { ...upcomingWhere, userId: actor.id } }),
    prisma.reservation.count({ where: { ...todayWhere, userId: actor.id } }),
    prisma.reservation.findMany({
      where: { ...upcomingWhere, userId: actor.id },
      orderBy: { startAt: "asc" },
      take: UPCOMING_LIMIT,
      include: upcomingInclude,
    }),
  ]);

  const mine = { upcomingCount: myUpcomingCount, todayCount: myTodayCount, upcoming: myUpcoming };

  if (actor.role !== "ADMIN") {
    return { today, activeResources, mine, system: null };
  }

  const [inactiveResources, upcomingCount, todayCount, pastConfirmed, cancelled, upcoming] = await Promise.all([
    prisma.resource.count({ where: { isActive: false } }),
    prisma.reservation.count({ where: upcomingWhere }),
    prisma.reservation.count({ where: todayWhere }),
    prisma.reservation.count({ where: { status: "CONFIRMED", endAt: { lte: now } } }),
    prisma.reservation.count({ where: { status: "CANCELLED" } }),
    prisma.reservation.findMany({
      where: upcomingWhere,
      orderBy: { startAt: "asc" },
      take: UPCOMING_LIMIT,
      include: upcomingInclude,
    }),
  ]);

  return {
    today,
    activeResources,
    mine,
    system: {
      inactiveResources,
      upcomingCount,
      todayCount,
      byStatus: { upcoming: upcomingCount, completed: pastConfirmed, cancelled },
      upcoming,
    },
  };
}
