import { describe, expect, it } from "vitest";
import { loginSchema } from "@/schemas/auth";

describe("loginSchema", () => {
  it("normalises the email and keeps the password as typed", () => {
    expect(loginSchema.parse({ email: "  Admin@RRMS.local ", password: " secret " })).toEqual({
      email: "admin@rrms.local",
      password: " secret ",
    });
  });

  it.each([
    [{ email: "not-an-email", password: "x" }, "email"],
    [{ email: "", password: "x" }, "email"],
    [{ email: "a@b.co", password: "" }, "password"],
    [{ email: "a@b.co", password: "x".repeat(201) }, "password"],
    [{ email: null, password: null }, "email"],
  ])("rejects %j on %s", (input, field) => {
    const result = loginSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain(field);
  });
});
