import { describe, expect, it } from "vitest";

import { RATE_LIMITS, rateLimitMessage } from "./rate-limits";

describe("rate-limit matrix", () => {
  it("defines a positive policy for every sensitive bucket", () => {
    for (const [key, policy] of Object.entries(RATE_LIMITS)) {
      expect(Number.isInteger(policy.limit), key).toBe(true);
      expect(policy.limit, key).toBeGreaterThan(0);
      expect(Number.isInteger(policy.windowSeconds), key).toBe(true);
      expect(policy.windowSeconds, key).toBeGreaterThan(0);
    }
  });

  it("keeps credential and registration buckets tight", () => {
    expect(RATE_LIMITS.login.limit).toBeLessThanOrEqual(10);
    expect(RATE_LIMITS.signup.limit).toBeLessThanOrEqual(5);
    expect(RATE_LIMITS.passwordChange.limit).toBeLessThanOrEqual(10);
    expect(RATE_LIMITS.inviteRegister.limit).toBeLessThanOrEqual(10);
  });

  it("limits expensive or externally-billed operations", () => {
    expect(RATE_LIMITS.agentRun.windowSeconds).toBeLessThanOrEqual(15 * 60);
    expect(RATE_LIMITS.outreachSend.windowSeconds).toBeLessThanOrEqual(15 * 60);
    expect(RATE_LIMITS.billingCheckout.limit).toBeLessThanOrEqual(20);
    expect(RATE_LIMITS.leadExport.limit).toBeLessThanOrEqual(20);
    expect(RATE_LIMITS.dataExport.limit).toBeLessThanOrEqual(5);
    expect(RATE_LIMITS.workspaceDeletion.limit).toBeLessThanOrEqual(5);
    expect(RATE_LIMITS.ownershipTransfer.limit).toBeLessThanOrEqual(5);
  });

  it("formats the retry hint in whole minutes", () => {
    expect(rateLimitMessage(1)).toBe("Too many attempts. Try again in about 1 minute.");
    expect(rateLimitMessage(60)).toBe("Too many attempts. Try again in about 1 minute.");
    expect(rateLimitMessage(61)).toBe("Too many attempts. Try again in about 2 minutes.");
  });
});
