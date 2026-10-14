import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { authenticate, findSessionUser } from "@/server/auth-service";
import { createUser, resetDatabase } from "../helpers/db";

const PASSWORD = "Correct-Horse-1";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("authenticate", () => {
  it("returns the user without the password hash for correct credentials", async () => {
    const created = await createUser({ email: "alice@example.com", role: "ADMIN", name: "Alice" });

    const user = await authenticate("alice@example.com", PASSWORD);

    expect(user).toEqual({ id: created.id, name: "Alice", email: "alice@example.com", role: "ADMIN" });
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("matches email case-insensitively and ignores surrounding spaces", async () => {
    await createUser({ email: "alice@example.com" });
    expect(await authenticate("  Alice@Example.COM ", PASSWORD)).not.toBeNull();
  });

  it("rejects a wrong password", async () => {
    await createUser({ email: "alice@example.com" });
    expect(await authenticate("alice@example.com", "wrong-password")).toBeNull();
  });

  it("rejects a password that differs only in case", async () => {
    await createUser({ email: "alice@example.com" });
    expect(await authenticate("alice@example.com", PASSWORD.toLowerCase())).toBeNull();
  });

  it("rejects an unknown email", async () => {
    expect(await authenticate("nobody@example.com", PASSWORD)).toBeNull();
  });

  it("stores bcrypt hashes, never the plain password", async () => {
    const created = await createUser({ email: "alice@example.com" });
    expect(created.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(created.passwordHash).not.toContain(PASSWORD);
  });
});

describe("findSessionUser", () => {
  it("reflects the current role, so a demotion applies to existing sessions", async () => {
    const created = await createUser({ email: "alice@example.com", role: "ADMIN" });
    await prisma.user.update({ where: { id: created.id }, data: { role: "USER" } });

    expect((await findSessionUser(created.id))?.role).toBe("USER");
  });

  it("returns null for a deleted user", async () => {
    const created = await createUser({ email: "alice@example.com" });
    await prisma.user.delete({ where: { id: created.id } });

    expect(await findSessionUser(created.id)).toBeNull();
  });

  it("returns null for an ID that is not a UUID instead of throwing", async () => {
    expect(await findSessionUser("not-a-uuid")).toBeNull();
  });
});
