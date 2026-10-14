import type { SessionUser } from "@/server/auth-service";

// Authorization rules shared by every service. The acting user always comes from
// the server-side session (getCurrentUser), never from form fields or request bodies.

export type AuthErrorCode = "UNAUTHENTICATED" | "FORBIDDEN";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }

  /** HTTP status for route handlers: 401 when signed out, 403 when not allowed. */
  get status(): 401 | 403 {
    return this.code === "UNAUTHENTICATED" ? 401 : 403;
  }
}

export function assertAuthenticated(user: SessionUser | null): asserts user is SessionUser {
  if (!user) {
    throw new AuthError("UNAUTHENTICATED", "Please sign in to continue.");
  }
}

export function assertAdmin(user: SessionUser | null): asserts user is SessionUser {
  assertAuthenticated(user);
  if (user.role !== "ADMIN") {
    throw new AuthError("FORBIDDEN", "Only administrators can do this.");
  }
}

/** Owners manage their own reservations; admins may manage any (e.g. a room taken out of service). */
export function canManageReservation(user: SessionUser, reservationOwnerId: string): boolean {
  return user.role === "ADMIN" || user.id === reservationOwnerId;
}

export function assertCanManageReservation(
  user: SessionUser | null,
  reservationOwnerId: string,
): asserts user is SessionUser {
  assertAuthenticated(user);
  if (!canManageReservation(user, reservationOwnerId)) {
    throw new AuthError("FORBIDDEN", "You can only manage your own reservations.");
  }
}
