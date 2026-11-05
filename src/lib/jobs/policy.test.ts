import { describe, expect, it } from "vitest";

import {
  backoffSeconds,
  canRetry,
  classifyJobError,
  JOB_LEASE_MS,
  MAX_JOB_ATTEMPTS,
  nextAvailableAt,
  PermanentJobError,
  TransientJobError,
} from "@/lib/jobs/policy";

describe("job retry policy", () => {
  it("backs off exponentially and caps at five minutes", () => {
    expect(backoffSeconds(1)).toBe(15);
    expect(backoffSeconds(2)).toBe(30);
    expect(backoffSeconds(3)).toBe(60);
    expect(backoffSeconds(4)).toBe(120);
    expect(backoffSeconds(5)).toBe(240);
    expect(backoffSeconds(6)).toBe(300);
    expect(backoffSeconds(20)).toBe(300);
    expect(backoffSeconds(0)).toBe(15);
  });

  it("computes the next available time from the attempt number", () => {
    const now = new Date("2026-10-30T12:00:00.000Z");
    expect(nextAvailableAt(1, now).toISOString()).toBe("2026-10-30T12:00:15.000Z");
    expect(nextAvailableAt(3, now).toISOString()).toBe("2026-10-30T12:01:00.000Z");
  });

  it("classifies transient and permanent errors", () => {
    expect(classifyJobError(new TransientJobError("rate limited"))).toBe("transient");
    expect(classifyJobError(new PermanentJobError("invalid input"))).toBe("permanent");
    expect(classifyJobError(new Error("socket hang up"))).toBe("transient");
    expect(classifyJobError("weird")).toBe("transient");
  });

  it("allows retries only while attempts remain", () => {
    expect(canRetry(1, MAX_JOB_ATTEMPTS)).toBe(true);
    expect(canRetry(2, MAX_JOB_ATTEMPTS)).toBe(true);
    expect(canRetry(3, MAX_JOB_ATTEMPTS)).toBe(false);
  });

  it("uses a two-minute lease", () => {
    expect(JOB_LEASE_MS).toBe(120_000);
    expect(MAX_JOB_ATTEMPTS).toBe(3);
  });
});
