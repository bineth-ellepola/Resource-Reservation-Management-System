import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_DURATION_SECONDS, signSessionToken, verifySessionToken } from "@/lib/auth/token";
import { findSessionUser, type SessionUser } from "@/server/auth-service";

// Data Access Layer for the session cookie. Every page, server action and route
// handler gets the current user from here; nothing trusts a user ID sent by the client.

const SESSION_COOKIE = "rrms_session";

export async function createSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await signSessionToken(userId), {
    httpOnly: true, // not readable from browser JavaScript
    secure: process.env.NODE_ENV === "production", // the app runs on http://localhost
    sameSite: "lax", // not sent on cross-site POSTs
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function deleteSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user loaded fresh from the database, or null. Memoised per render pass. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const userId = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  return userId ? findSessionUser(userId) : null;
});

/** For pages: returns the user or redirects to the login page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
