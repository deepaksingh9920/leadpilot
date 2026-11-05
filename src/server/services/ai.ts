import "server-only";

import type { z } from "zod";

import { parseAiOutput } from "@/lib/agents/output-schemas";
import { env } from "@/lib/env";
import { completeJson, type AiConfig, type AiMessage } from "@/lib/providers/ai";
import type { FetchLike } from "@/lib/providers/http";
import { ProviderError } from "@/lib/providers/types";

export function getAiConfig(): AiConfig | null {
  if (!env.aiConfigured || !env.aiApiKey || !env.aiModel) return null;
  return {
    apiKey: env.aiApiKey,
    model: env.aiModel,
    baseUrl: env.aiBaseUrl,
    timeoutMs: env.aiTimeoutMs,
    maxOutputTokens: env.aiMaxOutputTokens,
  };
}

/**
 * Calls the configured model and validates the parsed JSON against the agent's
 * output schema. Invalid output is a retryable dependency failure, never data.
 */
export async function completeStructured<T>(options: {
  schema: z.ZodType<T>;
  messages: AiMessage[];
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}): Promise<{ data: T; model: string }> {
  const config = getAiConfig();
  if (!config) {
    throw new ProviderError(
      "No AI provider is configured. Set AI_API_KEY and AI_MODEL on the server.",
      { code: "CONFIGURATION", retryable: false },
    );
  }

  const raw = await completeJson({
    config,
    messages: options.messages,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });

  const parsed = parseAiOutput(options.schema, raw);
  if (!parsed.ok) {
    throw new ProviderError(`AI output did not match the required schema: ${parsed.error}`, {
      code: "INVALID_RESPONSE",
      retryable: true,
    });
  }

  return { data: parsed.data, model: config.model };
}
