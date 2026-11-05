/**
 * Job lease and retry policy. Pure functions so the worker and unit tests share
 * exactly the same rules.
 */

export const JOB_LEASE_MS = 2 * 60 * 1000;
export const MAX_JOB_ATTEMPTS = 3;

export type JobOutcome = "succeeded" | "transient" | "permanent";

export function backoffSeconds(attempt: number): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(300, 15 * 2 ** (safeAttempt - 1));
}

export function nextAvailableAt(attempt: number, now = new Date()): Date {
  return new Date(now.getTime() + backoffSeconds(attempt) * 1000);
}

export class TransientJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientJobError";
  }
}

export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export function classifyJobError(error: unknown): JobOutcome {
  if (error instanceof TransientJobError) return "transient";
  if (error instanceof PermanentJobError) return "permanent";
  return "transient";
}

export function canRetry(attempts: number, maxAttempts: number): boolean {
  return attempts < maxAttempts;
}
