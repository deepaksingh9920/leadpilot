import { describe, expect, it } from "vitest";

import {
  loginSchema,
  resetPasswordSchema,
  safeNextPath,
  signupSchema,
} from "./auth";

const validSignup = {
  name: "Jordan Ellis",
  email: "Jordan@Example.com",
  companyName: "Northstar Studio",
  password: "longenough1",
  acceptTerms: "on",
};

describe("signupSchema", () => {
  it("accepts a valid signup and normalizes the email", () => {
    const result = signupSchema.safeParse(validSignup);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("jordan@example.com");
  });

  it("rejects short or non-alphanumeric passwords", () => {
    expect(signupSchema.safeParse({ ...validSignup, password: "short1" }).success).toBe(false);
    expect(
      signupSchema.safeParse({ ...validSignup, password: "onlyletters" }).success,
    ).toBe(false);
  });

  it("requires explicit terms acceptance", () => {
    const { acceptTerms: _ignored, ...withoutTerms } = validSignup;
    void _ignored;
    expect(signupSchema.safeParse(withoutTerms).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts normal sign-in input", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("requires matching passwords", () => {
    const result = resetPasswordSchema.safeParse({
      token: "abcdefghijkl",
      password: "longenough1",
      confirmPassword: "different1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });
});

describe("safeNextPath", () => {
  it("keeps local paths and rejects open redirects", () => {
    expect(safeNextPath("/settings")).toBe("/settings");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
  });
});
