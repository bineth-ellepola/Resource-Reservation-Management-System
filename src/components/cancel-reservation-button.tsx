"use client";

import { useActionState } from "react";
import { cancelReservationAction } from "@/app/actions/reservations";

export function CancelReservationButton({
  reservationId,
  view,
  description,
}: {
  reservationId: string;
  view: "mine" | "all";
  /** e.g. "Board Room A, Thu 15 Oct 2026, 09:00–10:00": tells screen readers which booking each button cancels. */
  description: string;
}) {
  const [state, formAction, pending] = useActionState(cancelReservationAction.bind(null, reservationId, view), {});

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Cancel this booking? The time slot will be released.")) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        aria-label={`Cancel booking: ${description}`}
        className="rounded-md border border-red-300 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "Cancelling…" : "Cancel booking"}
      </button>
      {state.error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
