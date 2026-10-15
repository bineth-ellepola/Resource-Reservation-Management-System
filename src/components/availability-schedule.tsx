import Link from "next/link";
import { suggestSlot } from "@/lib/availability";
import { colomboDateTime, formatColomboDate, formatColomboTime, startOfNextColomboHour, toColomboDateTimeLocal } from "@/lib/dates";
import type { getResourceAvailability } from "@/server/resource-service";

type Availability = Awaited<ReturnType<typeof getResourceAvailability>>;

/** Day/week list of free and booked periods for one resource, in Asia/Colombo time. */
export function AvailabilitySchedule({ availability, now }: { availability: Availability; now: Date }) {
  const { resource, view, firstDay, previousDay, nextDay, today, days } = availability;
  const base = `/resources/${resource.id}`;
  const href = (date: string, v: string = view) => `${base}?date=${date}&view=${v}`;
  const earliestBookableStart = startOfNextColomboHour(now);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Availability</h2>
        <nav aria-label="Availability dates" className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={href(previousDay)} className="rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-50">
            ← {view === "week" ? "Previous week" : "Previous day"}
          </Link>
          <Link href={href(today)} className="rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-50">
            Today
          </Link>
          <Link href={href(nextDay)} className="rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-50">
            {view === "week" ? "Next week" : "Next day"} →
          </Link>
          <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />
          <ViewLink href={href(firstDay, "day")} active={view === "day"} label="Day" />
          <ViewLink href={href(firstDay, "week")} active={view === "week"} label="Week" />
        </nav>
      </div>
      <p className="mt-1 text-xs text-slate-500">Times shown in Asia/Colombo (UTC+05:30). Bookings are end-exclusive: a booking ending at 10:00 leaves 10:00 free.</p>

      <div className="mt-3 space-y-4">
        {days.map(({ date, segments }) => {
          const dayEnd = colomboDateTime(date, "00:00").getTime() + 24 * 60 * 60 * 1000;
          const endLabel = (end: Date) => (end.getTime() === dayEnd ? "24:00" : formatColomboTime(end));
          const allFree = segments.length === 1 && segments[0].kind === "free";

          return (
            <section key={date} aria-labelledby={`day-${date}`} className="rounded-lg border border-slate-200 bg-white">
              <h3 id={`day-${date}`} className="border-b border-slate-200 px-4 py-2 text-sm font-medium">
                {formatColomboDate(colomboDateTime(date, "00:00"))}
                {date === today && <span className="ml-2 text-xs font-normal text-indigo-700">Today</span>}
              </h3>
              <ul className="divide-y divide-slate-100">
                {segments.map((segment) => {
                  const range = `${formatColomboTime(segment.start)}–${endLabel(segment.end)}`;
                  if (segment.kind === "booked") {
                    const label = segment.booking.isMine ? "Your booking" : segment.booking.bookedBy ? `Booked by ${segment.booking.bookedBy}` : "Booked";
                    return (
                      <li key={segment.start.toISOString()} className="flex items-center justify-between gap-3 bg-rose-50 px-4 py-2 text-sm">
                        <span className="font-mono">{range}</span>
                        <span className="font-medium text-rose-800">{label}</span>
                      </li>
                    );
                  }
                  const slot = resource.isActive ? suggestSlot(segment, earliestBookableStart) : null;
                  return (
                    <li key={segment.start.toISOString()} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="font-mono">{allFree ? "00:00–24:00" : range}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-medium text-emerald-700">{allFree ? "Free all day" : "Free"}</span>
                        {slot && (
                          <Link
                            href={`/reservations/new?resourceId=${resource.id}&start=${toColomboDateTimeLocal(slot.start)}&end=${toColomboDateTimeLocal(slot.end)}`}
                            className="rounded-md border border-indigo-300 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                            aria-label={`Book ${resource.name} from ${formatColomboDate(slot.start)} ${formatColomboTime(slot.start)}`}
                          >
                            Book
                          </Link>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ViewLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-2.5 py-1 ${active ? "bg-slate-800 text-white" : "border border-slate-300 hover:bg-slate-50"}`}
    >
      {label}
    </Link>
  );
}
