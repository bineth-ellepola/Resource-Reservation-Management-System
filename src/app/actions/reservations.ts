"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { cancelReservation, createReservation } from "@/server/reservation-service";
import { formValues, toFormState, type FormState } from "./form-state";

// Thin adapters over the reservation service, which takes the acting user from the
// server-side session and enforces every booking rule itself.

export async function createReservationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    await createReservation(await getCurrentUser(), values);
  } catch (error) {
    return toFormState(error, values);
  }
  redirect("/reservations?notice=booked");
}

export async function cancelReservationAction(reservationId: string, view: "mine" | "all"): Promise<FormState> {
  try {
    await cancelReservation(await getCurrentUser(), reservationId);
  } catch (error) {
    return toFormState(error);
  }
  redirect(view === "all" ? "/reservations?view=all&notice=cancelled" : "/reservations?notice=cancelled");
}
