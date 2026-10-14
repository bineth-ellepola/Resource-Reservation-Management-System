import { describe, expect, it } from "vitest";
import { isBookingConflict, postgresErrorCode } from "@/server/db-errors";

// Shape observed from @prisma/adapter-pg 7.10 for a real exclusion violation.
const prismaWrapped = (sqlState: string) => ({
  name: "PrismaClientKnownRequestError",
  code: "P2039",
  meta: {
    modelName: "Reservation",
    driverAdapterError: { name: "DriverAdapterError", cause: { originalCode: sqlState, kind: "postgres", code: sqlState } },
  },
});

describe("postgresErrorCode", () => {
  it("unwraps the SQLSTATE from a Prisma driver adapter error, not the generic P2039", () => {
    expect(postgresErrorCode(prismaWrapped("23P01"))).toBe("23P01");
  });

  it("reads the SQLSTATE from a raw pg error", () => {
    expect(postgresErrorCode({ code: "40P01" })).toBe("40P01");
  });

  it("returns undefined for errors without a SQLSTATE", () => {
    expect(postgresErrorCode(new Error("boom"))).toBeUndefined();
    expect(postgresErrorCode({ name: "PrismaClientKnownRequestError", code: "P2025" })).toBeUndefined();
    expect(postgresErrorCode({ name: "PrismaClientKnownRequestError", code: "P2039", meta: {} })).toBeUndefined();
    expect(postgresErrorCode(null)).toBeUndefined();
    expect(postgresErrorCode("23P01")).toBeUndefined();
  });
});

describe("isBookingConflict", () => {
  it.each(["23P01", "40P01"])("treats %s as a booking conflict", (code) => {
    expect(isBookingConflict(prismaWrapped(code))).toBe(true);
    expect(isBookingConflict({ code })).toBe(true);
  });

  it.each(["23514", "23503", "23505"])("does not treat %s (other constraint) as a booking conflict", (code) => {
    expect(isBookingConflict(prismaWrapped(code))).toBe(false);
  });

  it("does not treat unrelated errors as conflicts", () => {
    expect(isBookingConflict(new Error("connection refused"))).toBe(false);
  });
});
