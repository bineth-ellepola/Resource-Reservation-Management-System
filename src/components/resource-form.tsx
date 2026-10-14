"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/actions/form-state";
import { MAX_CAPACITY, RESOURCE_TYPE_LABELS, RESOURCE_TYPES } from "@/schemas/resource";

type ResourceFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: { name: string; type: string; location: string; capacity: number };
  submitLabel: string;
  cancelHref: string;
};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm aria-invalid:border-red-500";

export function ResourceForm({ action, initial, submitLabel, cancelHref }: ResourceFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const value = (field: keyof NonNullable<typeof initial>) => state.values?.[field] ?? String(initial?.[field] ?? "");
  const errorFor = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <form action={formAction} noValidate className="max-w-lg space-y-4">
      <div role="alert" aria-live="polite">
        {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      </div>

      <Field id="name" label="Name" error={errorFor("name")}>
        <input id="name" name="name" required maxLength={100} defaultValue={value("name")} {...describedBy("name", errorFor("name"))} className={inputClass} />
      </Field>

      <Field id="type" label="Type" error={errorFor("type")}>
        <select id="type" name="type" required defaultValue={value("type")} {...describedBy("type", errorFor("type"))} className={inputClass}>
          <option value="" disabled>
            Choose a type
          </option>
          {RESOURCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {RESOURCE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </Field>

      <Field id="location" label="Location" error={errorFor("location")}>
        <input id="location" name="location" required maxLength={150} defaultValue={value("location")} {...describedBy("location", errorFor("location"))} className={inputClass} />
      </Field>

      <Field id="capacity" label="Capacity" hint="People it holds, or units for equipment." error={errorFor("capacity")}>
        <input
          id="capacity"
          name="capacity"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_CAPACITY}
          step={1}
          required
          defaultValue={value("capacity")}
          {...describedBy("capacity", errorFor("capacity"), true)}
          className={inputClass}
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={pending} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href={cancelHref} className="text-sm text-slate-700 underline-offset-2 hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function describedBy(id: string, error: string | undefined, hasHint = false) {
  const ids = [hasHint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return { "aria-invalid": error ? true : undefined, "aria-describedby": ids || undefined };
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
