import { z } from "zod";
import { parseColomboDateTimeLocal } from "@/lib/dates";

export const MAX_BOOKING_DAYS = 14;
const MAX_BOOKING_MS = MAX_BOOKING_DAYS * 24 * 60 * 60 * 1000;

const colomboDateTimeField = (label: string) =>
  z
    .string({ error: `Enter a ${label}.` })
    .min(1, `Enter a ${label}.`)
    .transform((value, ctx) => {
      const instant = parseColomboDateTimeLocal(value);
      if (!instant) {
        ctx.addIssue({ code: "custom", message: `Enter a valid ${label}.` });
        return z.NEVER;
      }
      return instant;
    });

/**
 * Booking input. Times are datetime-local values interpreted as Asia/Colombo time, so a
 * booking may span midnight or several days. There is deliberately no userId or status
 * field: the owner comes from the session and new bookings are always CONFIRMED.
 * "Not in the past" is checked by the service, which knows the current time.
 */
export const reservationInputSchema = z
  .object({
    resourceId: z.uuid({ error: "Choose a resource." }),
    start: colomboDateTimeField("start date and time"),
    end: colomboDateTimeField("end date and time"),
    purpose: z
      .string()
      .trim()
      .max(200, "Purpose must be 200 characters or fewer.")
      .optional()
      .transform((value) => value || null),
  })
  .superRefine(({ start, end }, ctx) => {
    // Zod still runs object-level refinements after a field fails, passing the raw value;
    // only compare once both fields have become valid instants.
    if (!(start instanceof Date) || !(end instanceof Date)) {
      return;
    }
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "End must be after the start." });
    } else if (end.getTime() - start.getTime() > MAX_BOOKING_MS) {
      ctx.addIssue({ code: "custom", path: ["end"], message: `A booking can last at most ${MAX_BOOKING_DAYS} days.` });
    }
  });

export type ReservationInput = z.output<typeof reservationInputSchema>;
