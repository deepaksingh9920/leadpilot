/**
 * Suppression reasons are shared by server services and client forms. Keep this
 * module free of server-only imports so the select options stay in sync.
 */

export const SUPPRESSION_REASONS = [
  "UNSUBSCRIBED",
  "BOUNCED",
  "COMPLAINT",
  "MANUAL",
] as const;

export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const SUPPRESSION_REASON_LABELS: Record<SuppressionReason, string> = {
  UNSUBSCRIBED: "Unsubscribed",
  BOUNCED: "Hard bounce",
  COMPLAINT: "Complaint",
  MANUAL: "Added manually",
};
