export type RateLimitPolicy = {
  limit: number;
  windowSeconds: number;
};

/**
 * Central rate-limit matrix. Every sensitive or expensive server action and API
 * route takes its policy from here so the limits are reviewable in one place.
 *
 * Keys are intentionally stable: the limiter stores them in the database, so
 * renaming a key resets that bucket's history.
 */
export const RATE_LIMITS = {
  signup: { limit: 3, windowSeconds: 60 * 60 },
  login: { limit: 5, windowSeconds: 15 * 60 },
  forgotPassword: { limit: 5, windowSeconds: 60 * 60 },
  resetPassword: { limit: 5, windowSeconds: 60 * 60 },
  resendVerification: { limit: 3, windowSeconds: 60 * 60 },
  onboarding: { limit: 15, windowSeconds: 60 * 60 },
  passwordChange: { limit: 5, windowSeconds: 60 * 60 },
  profileUpdate: { limit: 30, windowSeconds: 60 * 60 },
  csvImport: { limit: 10, windowSeconds: 60 * 60 },
  suppressionImport: { limit: 5, windowSeconds: 60 },
  leadExport: { limit: 10, windowSeconds: 60 * 60 },
  agentRun: { limit: 20, windowSeconds: 5 * 60 },
  outreachDraft: { limit: 60, windowSeconds: 60 * 60 },
  outreachSend: { limit: 30, windowSeconds: 5 * 60 },
  teamInvite: { limit: 20, windowSeconds: 60 * 60 },
  inviteAccept: { limit: 10, windowSeconds: 60 * 60 },
  inviteRegister: { limit: 5, windowSeconds: 60 * 60 },
  billingCheckout: { limit: 10, windowSeconds: 60 * 60 },
  complianceUpdate: { limit: 20, windowSeconds: 60 * 60 },
  dataExport: { limit: 3, windowSeconds: 60 * 60 },
  retentionCleanup: { limit: 5, windowSeconds: 60 * 60 },
  workspaceDeletion: { limit: 3, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitKey = keyof typeof RATE_LIMITS;

export function rateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
