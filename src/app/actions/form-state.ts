import { AuthError } from "@/server/authz";
import { NotFoundError, ValidationError, type FieldErrors } from "@/server/errors";

/** State returned by form server actions to useActionState. */
export type FormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Submitted values, so the form can be re-filled after an error. */
  values?: Record<string, string>;
};

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

/** Maps expected service errors to a user-facing message; rethrows anything unexpected. */
export function toFormState(error: unknown, values?: Record<string, string>): FormState {
  if (error instanceof ValidationError) {
    return { error: error.message, fieldErrors: error.fieldErrors, values };
  }
  if (error instanceof AuthError || error instanceof NotFoundError) {
    return { error: error.message, values };
  }
  throw error;
}
