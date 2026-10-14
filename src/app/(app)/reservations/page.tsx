import type { Metadata } from "next";
import Link from "next/link";
import { CancelReservationButton } from "@/components/cancel-reservation-button";
import { formatColomboRange } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { listAllReservations, listMyReservations } from "@/server/reservation-service";

export const metadata: Metadata = { title: "Bookings" };

const NOTICES: Record<string, string> = {
  booked: "Booking confirmed.",
  cancelled: "Booking cancelled. The time slot is free again.",
};

type Reservation = Awaited<ReturnType<typeof listMyReservations>>["upcoming"][number];

export default async function ReservationsPage({ searchParams }: PageProps<"/reservations">) {
  const user = await requireUser();
  const params = await searchParams;
  const isAdmin = user.role === "ADMIN";
  const view = isAdmin && params.view === "all" ? "all" : "mine";
  const { upcoming, history } = view === "all" ? await listAllReservations(user) : await listMyReservations(user);
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{view === "all" ? "All bookings" : "My bookings"}</h1>
        <Link href="/reservations/new" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          New booking
        </Link>
      </div>

      {notice && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {isAdmin && (
        <nav aria-label="Booking views" className="flex gap-2 text-sm">
          <ViewTab href="/reservations" active={view === "mine"} label="My bookings" />
          <ViewTab href="/reservations?view=all" active={view === "all"} label="All bookings" />
        </nav>
      )}

      <p className="text-xs text-slate-500">Times shown in Asia/Colombo (UTC+05:30)</p>

      <div>
        <h2 className="text-lg font-semibold">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
            No upcoming bookings.{" "}
            <Link href="/resources" className="underline">
              Browse resources
            </Link>{" "}
            to make one.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {upcoming.map((reservation) => (
              <ReservationCard key={reservation.id} reservation={reservation} showOwner={view === "all"}>
                <CancelReservationButton
                  reservationId={reservation.id}
                  view={view}
                  description={`${reservation.resource.name}, ${formatColomboRange(reservation.startAt, reservation.endAt)}`}
                />
              </ReservationCard>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold">History</h2>
        <p className="text-xs text-slate-500">Past and cancelled bookings (most recent 50).</p>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No past or cancelled bookings yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {history.map((reservation) => (
              <ReservationCard key={reservation.id} reservation={reservation} showOwner={view === "all"} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ViewTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 ${active ? "bg-slate-800 text-white" : "border border-slate-300 hover:bg-slate-50"}`}
    >
      {label}
    </Link>
  );
}

function ReservationCard({
  reservation,
  showOwner,
  children,
}: {
  reservation: Reservation;
  showOwner: boolean;
  children?: React.ReactNode;
}) {
  const cancelled = reservation.status === "CANCELLED";
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <p className="font-medium">
          <Link href={`/resources/${reservation.resource.id}`} className="hover:underline">
            {reservation.resource.name}
          </Link>
          {cancelled && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">Cancelled</span>}
        </p>
        <p className={`text-sm ${cancelled ? "text-slate-500 line-through" : "text-slate-700"}`}>
          {formatColomboRange(reservation.startAt, reservation.endAt)}
        </p>
        <p className="text-sm text-slate-500">
          {reservation.resource.location}
          {reservation.purpose && ` · ${reservation.purpose}`}
          {showOwner && ` · ${reservation.user.name}`}
        </p>
      </div>
      {children}
    </li>
  );
}
