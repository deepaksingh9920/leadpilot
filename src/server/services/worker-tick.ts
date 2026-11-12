import "server-only";

import { runRetentionCleanup } from "@/server/services/compliance";
import { runWorker } from "@/server/services/jobs";

export type RetentionResult =
  | Awaited<ReturnType<typeof runRetentionCleanup>>
  | { error: string };

export type WorkerTickResult = Awaited<ReturnType<typeof runWorker>> & {
  retention: RetentionResult;
};

/**
 * One scheduler tick: drain a batch of queued jobs, then apply retention cleanup.
 * Both the authenticated POST endpoint and the Vercel Cron GET endpoint call this,
 * so the two triggers cannot drift apart. Retention failure is reported without
 * hiding the job results that were already produced.
 */
export async function runWorkerTick(options: {
  limit?: number;
} = {}): Promise<WorkerTickResult> {
  const result = await runWorker({ limit: options.limit });

  let retention: RetentionResult;
  try {
    retention = await runRetentionCleanup();
  } catch (error) {
    console.error("Retention cleanup failed", error);
    retention = { error: "Retention cleanup failed." };
  }

  return { ...result, retention };
}
