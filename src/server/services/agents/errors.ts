import { PermanentJobError, TransientJobError } from "@/lib/jobs/policy";
import { ProviderError } from "@/lib/providers/types";

/**
 * Converts provider failures into the queue's retry contract. Unknown errors are
 * left alone so processJob's default transient classification applies.
 */
export function throwAsJobError(error: unknown): never {
  if (error instanceof PermanentJobError || error instanceof TransientJobError) throw error;

  if (error instanceof ProviderError) {
    const message = `${error.code}: ${error.message}`;
    if (error.retryable) throw new TransientJobError(message);
    throw new PermanentJobError(message);
  }

  throw error;
}
