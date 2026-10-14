import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/auth-service";
import {
  AuthError,
  assertAdmin,
  assertAuthenticated,
  assertCanManageReservation,
  canManageReservation,
} from "@/server/authz";

const admin: SessionUser = { id: "a0000000-0000-4000-8000-000000000001", name: "Admin", email: "admin@x.io", role: "ADMIN" };
const alice: SessionUser = { id: "a0000000-0000-4000-8000-000000000002", name: "Alice", email: "alice@x.io", role: "USER" };
const bob: SessionUser = { id: "a0000000-0000-4000-8000-000000000003", name: "Bob", email: "bob@x.io", role: "USER" };

function captureAuthError(fn: () => void): AuthError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AuthError) return error;
    throw error;
  }
  throw new Error("expected an AuthError");
}

describe("assertAuthenticated", () => {
  it("rejects anonymous requests with 401", () => {
    const error = captureAuthError(() => assertAuthenticated(null));
    expect(error.code).toBe("UNAUTHENTICATED");
    expect(error.status).toBe(401);
  });

  it("accepts any signed-in user", () => {
    expect(() => assertAuthenticated(alice)).not.toThrow();
  });
});

describe("assertAdmin", () => {
  it("rejects anonymous requests with 401, not 403", () => {
    expect(captureAuthError(() => assertAdmin(null)).status).toBe(401);
  });

  it("rejects regular users with 403", () => {
    const error = captureAuthError(() => assertAdmin(alice));
    expect(error.code).toBe("FORBIDDEN");
    expect(error.status).toBe(403);
  });

  it("accepts admins", () => {
    expect(() => assertAdmin(admin)).not.toThrow();
  });
});

describe("reservation ownership", () => {
  it("lets owners manage their own reservation", () => {
    expect(canManageReservation(alice, alice.id)).toBe(true);
    expect(() => assertCanManageReservation(alice, alice.id)).not.toThrow();
  });

  it("forbids users from managing someone else's reservation", () => {
    expect(canManageReservation(bob, alice.id)).toBe(false);
    expect(captureAuthError(() => assertCanManageReservation(bob, alice.id)).status).toBe(403);
  });

  it("lets admins manage any reservation", () => {
    expect(() => assertCanManageReservation(admin, alice.id)).not.toThrow();
  });

  it("rejects anonymous requests with 401", () => {
    expect(captureAuthError(() => assertCanManageReservation(null, alice.id)).status).toBe(401);
  });
});
