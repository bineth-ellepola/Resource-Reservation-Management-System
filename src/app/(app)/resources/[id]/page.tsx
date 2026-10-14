import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResourceActiveToggle } from "@/components/resource-active-toggle";
import { formatColomboRange } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { RESOURCE_TYPE_LABELS } from "@/schemas/resource";
import { NotFoundError } from "@/server/errors";
import { getResourceDetails } from "@/server/resource-service";

export const metadata: Metadata = { title: "Resource" };

export default async function ResourceDetailsPage({ params }: PageProps<"/resources/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const details = await getResourceDetails(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const { resource, upcoming } = details;
  const isAdmin = user.role === "ADMIN";

  return (
    <section className="space-y-6">
      <Link href="/resources" className="text-sm text-slate-600 hover:underline">
        ← All resources
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {resource.name}
            {!resource.isActive && <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 align-middle text-sm font-medium text-slate-700">Inactive</span>}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{RESOURCE_TYPE_LABELS[resource.type]}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {resource.isActive && (
            <Link
              href={`/reservations/new?resourceId=${resource.id}`}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Book this resource
            </Link>
          )}
          {isAdmin && (
            <>
              <Link href={`/resources/${resource.id}/edit`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
                Edit
              </Link>
              <ResourceActiveToggle resourceId={resource.id} isActive={resource.isActive} />
            </>
          )}
        </div>
      </div>

      {!resource.isActive && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This resource is inactive. Existing bookings are kept, but no new bookings can be made.
        </p>
      )}

      <dl className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-slate-500">Location</dt>
          <dd className="font-medium">{resource.location}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Capacity</dt>
          <dd className="font-medium">{resource.capacity}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Status</dt>
          <dd className="font-medium">{resource.isActive ? "Active" : "Inactive"}</dd>
        </div>
      </dl>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Upcoming bookings</h2>
          <p className="text-xs text-slate-500">Times shown in Asia/Colombo (UTC+05:30)</p>
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
            No upcoming bookings. The resource is free.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {upcoming.map((booking) => (
              <li key={booking.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium">{formatColomboRange(booking.startAt, booking.endAt)}</span>
                <span className="text-slate-600">
                  {booking.isMine ? "Your booking" : (booking.bookedBy ?? "Booked")}
                  {booking.purpose && <span className="text-slate-500"> · {booking.purpose}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
