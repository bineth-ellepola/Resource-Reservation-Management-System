import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT, UnsecuredJWT } from "jose";
import { SESSION_DURATION_SECONDS, signSessionToken, verifySessionToken } from "@/lib/auth/token";

const USER_ID = "8b0c3f1e-2d4a-4c6b-9e8f-0a1b2c3d4e5f";
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("session tokens", () => {
  it("round-trips the user ID", async () => {
    expect(await verifySessionToken(await signSessionToken(USER_ID))).toBe(USER_ID);
  });

  it("rejects a missing token", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("rejects a token whose payload was modified", async () => {
    const [header, , signature] = (await signSessionToken(USER_ID)).split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "attacker-chosen-id" })).toString("base64url");
    expect(await verifySessionToken(`${header}.${forgedPayload}.${signature}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER_ID)
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-completely-different-secret-value-123"));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('rejects an unsigned ("alg": "none") token', async () => {
    const token = new UnsecuredJWT({}).setSubject(USER_ID).setExpirationTime("1h").encode();
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a token after it expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const token = await signSessionToken(USER_ID);

    vi.setSystemTime(new Date(Date.UTC(2030, 0, 1) + (SESSION_DURATION_SECONDS - 60) * 1000));
    expect(await verifySessionToken(token)).toBe(USER_ID);

    vi.setSystemTime(new Date(Date.UTC(2030, 0, 1) + (SESSION_DURATION_SECONDS + 60) * 1000));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a token without a subject", async () => {
    const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(key());
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("refuses to sign with a missing or short AUTH_SECRET", async () => {
    vi.stubEnv("AUTH_SECRET", "too-short");
    await expect(signSessionToken(USER_ID)).rejects.toThrow(/AUTH_SECRET/);
  });
});
