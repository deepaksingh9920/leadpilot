import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPROVAL_POLICY,
  isApprovalPolicy,
  parseRetentionDays,
  purgeCutoff,
  retentionCutoff,
  retentionLabel,
  SOFT_DELETE_GRACE_DAYS,
} from "./settings";

describe("compliance settings", () => {
  it("accepts only known approval policies and defaults to admins and owners", () => {
    expect(isApprovalPolicy("ADMIN_OR_OWNER")).toBe(true);
    expect(isApprovalPolicy("OWNER_ONLY")).toBe(true);
    expect(isApprovalPolicy("ANYONE")).toBe(false);
    expect(isApprovalPolicy(null)).toBe(false);
    expect(DEFAULT_APPROVAL_POLICY).toBe("ADMIN_OR_OWNER");
  });

  it("parses only offered retention windows", () => {
    expect(parseRetentionDays("keep")).toBeNull();
    expect(parseRetentionDays("")).toBeNull();
    expect(parseRetentionDays(null)).toBeNull();
    expect(parseRetentionDays("30")).toBe(30);
    expect(parseRetentionDays(365)).toBe(365);
    expect(parseRetentionDays("45")).toBeUndefined();
    expect(parseRetentionDays("0")).toBeUndefined();
    expect(parseRetentionDays("abc")).toBeUndefined();
  });

  it("computes the retention and purge cutoffs from explicit dates", () => {
    const now = new Date("2026-11-10T12:00:00.000Z");
    expect(retentionCutoff(null, now)).toBeNull();
    expect(retentionCutoff(30, now)?.toISOString()).toBe("2026-10-11T12:00:00.000Z");
    expect(purgeCutoff(now).toISOString()).toBe("2026-10-11T12:00:00.000Z");
    expect(SOFT_DELETE_GRACE_DAYS).toBe(30);
  });

  it("labels retention windows honestly", () => {
    expect(retentionLabel(null)).toBe("Keep until deleted");
    expect(retentionLabel(90)).toBe("90 days");
    expect(retentionLabel(45)).toBe("45 days");
  });
});
