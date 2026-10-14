"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createReservationAction } from "@/app/actions/reservations";

type ResourceOption = { id: string; name: string; location: string };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm aria-invalid:border-red-500";

export function ReservationForm({
  resources,
  defaults,
  minStart,
}: {
  resources: ResourceOption[];
  defaults: { resourceId: string; start: string; end: string };
  /** Earliest selectable start (Colombo datetime-local); the server re-checks. */
  minStart: string;
}) {
  const [state, formAction, pending] = useActionState(createReservationAction, {});
  const value = (field: "resourceId" | "start" | "end" | "purpose") =>
    state.values?.[field] ?? (field === "purpose" ? "" : defaults[field]);
  const errorFor = (field: string) => state.fieldErrors?.[field]?.[0];
  const aria = (field: string) => ({
    "aria-invalid": errorFor(field) ? true : undefined,
    "aria-describedby": errorFor(field) ? `${field}-error` : undefined,
  });

  return (
    <form action={formAction} noValidate className="max-w-lg space-y-4">
      <div role="alert" aria-live="polite">
        {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      </div>

      <div>
        <label htmlFor="resourceId" className="block text-sm font-medium">
          Resource
        </label>
        <select id="resourceId" name="resourceId" required defaultValue={value("resourceId")} {...aria("resourceId")} className={inputClass}>
          <option value="" disabled>
            Choose a resource
          </option>
          {resources.map((resource) => (
            <option key={resource.id} value={resource.id}>
              {resource.name} ({resource.location})
            </option>
          ))}
        </select>
        <FieldError id="resourceId" message={errorFor("resourceId")} />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">When</legend>
        <p id="timezone-hint" className="text-xs text-slate-500">
          Times are in Asia/Colombo (UTC+05:30). A booking can run past midnight.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="start" className="block text-sm">
              Start
            </label>
            <input id="start" name="start" type="datetime-local" required min={minStart} defaultValue={value("start")} {...aria("start")} className={inputClass} />
            <FieldError id="start" message={errorFor("start")} />
          </div>
          <div>
            <label htmlFor="end" className="block text-sm">
              End
            </label>
            <input id="end" name="end" type="datetime-local" required min={minStart} defaultValue={value("end")} {...aria("end")} className={inputClass} />
            <FieldError id="end" message={errorFor("end")} />
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="purpose" className="block text-sm font-medium">
          Purpose <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input id="purpose" name="purpose" maxLength={200} defaultValue={value("purpose")} {...aria("purpose")} className={inputClass} />
        <FieldError id="purpose" message={errorFor("purpose")} />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={pending} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {pending ? "Booking…" : "Book"}
        </button>
        <Link href="/reservations" className="text-sm text-slate-700 underline-offset-2 hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
      {message}
    </p>
  ) : null;
}
