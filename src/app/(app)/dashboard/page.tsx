import type { Metadata } from "next";
import Link from "next/link";
import { formatColomboDate, formatColomboRange, colomboDateTime } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { getDashboardSummary } from "@/server/dashboard-service";

export const metadata: Metadata = { title: "Dashboard" };

type Summary = Awaited<ReturnType<typeof getDashboardSummary>>;
type UpcomingReservation = Summary["mine"]["upcoming"][number];

export default async function DashboardPage() {
  const user = await requireUser();
  const summary = await getDashboardSummary(user);
  const { mine, system } = summary;

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Signed in as {user.email} ({user.role === "ADMIN" ? "administrator" : "user"}).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/resources" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
            Browse resources
          </Link>
          <Link href="/reservations/new" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            New booking
          </Link>
        </div>
      </div>

      <div>
        <h2 className="sr-only">Summary</h2>
        <p className="text-xs text-slate-500">
          Today is {formatColomboDate(colomboDateTime(summary.today, "12:00"))} (Asia/Colombo, UTC+05:30).
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active resources" value={summary.activeResources} href="/resources" />
          <Stat label="My upcoming bookings" value={mine.upcomingCount} href="/reservations" />
          <Stat label="My bookings today" value={mine.todayCount} href="/reservations" />
          {system && <Stat label="All upcoming bookings" value={system.upcomingCount} href="/reservations?view=all" />}
        </dl>
      </div>

      {system && (
        <div>
          <h2 className="text-lg font-semibold">All bookings by status</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Upcoming (confirmed)" value={system.byStatus.upcoming} />
            <Stat label="Completed (confirmed, ended)" value={system.byStatus.completed} />
            <Stat label="Cancelled" value={system.byStatus.cancelled} />
          </dl>
          <p className="mt-2 text-sm text-slate-600">
            {system.todayCount} {system.todayCount === 1 ? "booking" : "bookings"} today across all resources ·{" "}
            {system.inactiveResources} inactive {system.inactiveResources === 1 ? "resource" : "resources"}
          </p>
        </div>
      )}

      <UpcomingList
        title="My next bookings"
        reservations={mine.upcoming}
        total={mine.upcomingCount}
        href="/reservations"
        showOwner={false}
      />

      {system && (
        <UpcomingList
          title="Next bookings across all resources"
          reservations={system.upcoming}
          total={system.upcomingCount}
          href="/reservations?view=all"
          showOwner
        />
      )}
    </section>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  // The label is the link; its ::after stretches over the whole card so the card is clickable.
  return (
    <div
      className={`relative rounded-lg border border-slate-200 bg-white p-4 ${href ? "hover:border-indigo-300 hover:bg-indigo-50/40" : ""}`}
    >
      <dt className="text-sm text-slate-600">
        {href ? (
          <Link href={href} className="after:absolute after:inset-0 after:rounded-lg">
            {label}
          </Link>
        ) : (
          label
        )}
      </dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function UpcomingList({
  title,
  reservations,
  total,
  href,
  showOwner,
}: {
  title: string;
  reservations: UpcomingReservation[];
  total: number;
  href: string;
  showOwner: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {total > reservations.length && (
          <Link href={href} className="text-sm text-indigo-700 underline">
            View all {total}
          </Link>
        )}
      </div>
      {reservations.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
          No upcoming bookings.{" "}
          <Link href="/resources" className="underline">
            Browse resources
          </Link>{" "}
          to make one.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {reservations.map((reservation) => (
            <li key={reservation.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <Link href={`/resources/${reservation.resource.id}`} className="font-medium hover:underline">
                {reservation.resource.name}
              </Link>
              <span className="text-sm text-slate-700">{formatColomboRange(reservation.startAt, reservation.endAt)}</span>
              <span className="w-full text-sm text-slate-500">
                {reservation.resource.location}
                {showOwner && ` · ${reservation.user.name}`}
                {reservation.purpose && ` · ${reservation.purpose}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
