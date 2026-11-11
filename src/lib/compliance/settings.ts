export const APPROVAL_POLICIES = ["ADMIN_OR_OWNER", "OWNER_ONLY"] as const;

export type ApprovalPolicy = (typeof APPROVAL_POLICIES)[number];

export const APPROVAL_POLICY_LABELS: Record<ApprovalPolicy, string> = {
  ADMIN_OR_OWNER: "Admins and owners",
  OWNER_ONLY: "Owner only",
};

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = "ADMIN_OR_OWNER";

export function isApprovalPolicy(value: unknown): value is ApprovalPolicy {
  return typeof value === "string" && (APPROVAL_POLICIES as readonly string[]).includes(value);
}

/**
 * Selectable lead-retention windows in days. `null` keeps active leads until a
 * person deletes them. Soft-deleted leads are always purged after the grace
 * period, so the effective maximum retention is the window plus that grace.
 */
export const RETENTION_DAY_OPTIONS = [null, 30, 90, 180, 365] as const;

export const RETENTION_LABELS: Record<string, string> = {
  keep: "Keep until deleted",
  "30": "30 days",
  "90": "90 days",
  "180": "180 days",
  "365": "365 days",
};

export const SOFT_DELETE_GRACE_DAYS = 30;

export function parseRetentionDays(value: unknown): number | null | undefined {
  if (value === null || value === "" || value === "keep" || value === "null") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  if (!(RETENTION_DAY_OPTIONS as readonly (number | null)[]).includes(parsed)) return undefined;
  return parsed;
}

/** Leads untouched for longer than the retention window are soft-deleted. */
export function retentionCutoff(days: number | null, now: Date = new Date()): Date | null {
  if (days === null) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Soft-deleted rows older than the grace period can be purged permanently. */
export function purgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

export function retentionLabel(days: number | null): string {
  return RETENTION_LABELS[days === null ? "keep" : String(days)] ?? `${days} days`;
}
