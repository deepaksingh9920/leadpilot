import { timingSafeEqual } from "node:crypto";

export type WorkerAuthHeaders = {
  authorization?: string | null;
  workerSecret?: string | null;
};

/**
 * Constant-time check for the worker endpoint. The secret may arrive as a
 * `Bearer` token or an `x-worker-secret` header. A missing server secret always
 * fails, so the endpoint stays disabled until `WORKER_SECRET` is configured.
 */
export function isWorkerAuthorized(
  secret: string | undefined,
  headers: WorkerAuthHeaders,
): boolean {
  if (!secret) return false;

  const candidate =
    headers.authorization?.replace(/^Bearer\s+/i, "") ?? headers.workerSecret ?? "";
  const expected = Buffer.from(secret);
  const provided = Buffer.from(candidate);

  // timingSafeEqual throws on length mismatch, so compare lengths first. The
  // length itself is not secret.
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
