import { z } from "zod";

// Service-layer errors. Server actions translate these (and AuthError) into form state;
// anything else is unexpected and goes to the error boundary.

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export type FieldErrors = Record<string, string[] | undefined>;

export class ValidationError extends Error {
  constructor(readonly fieldErrors: FieldErrors) {
    super("Please correct the highlighted fields.");
    this.name = "ValidationError";
  }
}

/** Validates untrusted input with a Zod schema, throwing ValidationError on failure. */
export function parseInput<Schema extends z.ZodType>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(z.flattenError(result.error).fieldErrors as FieldErrors);
  }
  return result.data;
}
