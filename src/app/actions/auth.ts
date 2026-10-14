"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { loginSchema } from "@/schemas/auth";
import { authenticate } from "@/server/auth-service";
import { createSession, deleteSession } from "@/lib/session";

export type LoginState = {
  email?: string;
  error?: string;
  fieldErrors?: { email?: string[]; password?: string[] };
};

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = typeof formData.get("email") === "string" ? String(formData.get("email")) : "";

  if (!parsed.success) {
    return { email, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    // Same message for unknown email and wrong password, so accounts can't be enumerated.
    return { email, error: "Invalid email or password." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
