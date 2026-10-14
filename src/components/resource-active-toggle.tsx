"use client";

import { useActionState } from "react";
import { setResourceActiveAction } from "@/app/actions/resources";

export function ResourceActiveToggle({ resourceId, isActive }: { resourceId: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState(setResourceActiveAction.bind(null, resourceId, !isActive), {});

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (isActive && !window.confirm("Deactivate this resource? Existing bookings are kept, but no new bookings can be made.")) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${
          isActive ? "border-red-300 text-red-700 hover:bg-red-50" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
        }`}
      >
        {pending ? "Saving…" : isActive ? "Deactivate" : "Reactivate"}
      </button>
      {state.error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
