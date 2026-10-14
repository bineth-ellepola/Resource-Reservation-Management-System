import type { Metadata } from "next";
import Link from "next/link";
import { ReservationForm } from "@/components/reservation-form";
import { startOfNextColomboHour, toColomboDateTimeLocal } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { listResources } from "@/server/resource-service";

export const metadata: Metadata = { title: "New booking" };

export default async function NewReservationPage({ searchParams }: PageProps<"/reservations/new">) {
  const user = await requireUser();
  const { resourceId } = await searchParams;
  const resources = await listResources(user, { status: "active" });

  if (resources.length === 0) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">New booking</h1>
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
          There are no active resources to book right now.
        </p>
      </section>
    );
  }

  const now = new Date();
  const start = startOfNextColomboHour(now);
  const preselected = resources.find((r) => r.id === resourceId)?.id ?? "";

  return (
    <section className="space-y-6">
      <div>
        <Link href={preselected ? `/resources/${preselected}` : "/resources"} className="text-sm text-slate-600 hover:underline">
          ← Back
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New booking</h1>
      </div>
      <ReservationForm
        resources={resources.map(({ id, name, location }) => ({ id, name, location }))}
        defaults={{
          resourceId: preselected,
          start: toColomboDateTimeLocal(start),
          end: toColomboDateTimeLocal(new Date(start.getTime() + 60 * 60 * 1000)),
        }}
        minStart={toColomboDateTimeLocal(now)}
      />
    </section>
  );
}
