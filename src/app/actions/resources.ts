"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { createResource, setResourceActive, updateResource } from "@/server/resource-service";
import { formValues, toFormState, type FormState } from "./form-state";

// Thin adapters: authorization and validation happen in the resource service, which
// receives the acting user from the server-side session, never from the form.

export async function createResourceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  let resourceId: string;
  try {
    resourceId = (await createResource(await getCurrentUser(), values)).id;
  } catch (error) {
    return toFormState(error, values);
  }
  redirect(`/resources/${resourceId}`);
}

export async function updateResourceAction(resourceId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    await updateResource(await getCurrentUser(), resourceId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  redirect(`/resources/${resourceId}`);
}

export async function setResourceActiveAction(resourceId: string, isActive: boolean): Promise<FormState> {
  try {
    await setResourceActive(await getCurrentUser(), resourceId, isActive);
  } catch (error) {
    return toFormState(error);
  }
  // Re-render the resource page with its new status (works with and without JavaScript).
  redirect(`/resources/${resourceId}`);
}
