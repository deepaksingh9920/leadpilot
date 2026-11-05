/**
 * OpenAI-compatible chat-completions adapter.
 *
 * Supports any endpoint that implements `POST /chat/completions` with JSON
 * output. The caller owns validation: this module only guarantees transport,
 * timeout handling, and that the response body parses as JSON.
 */

import { requestJson, trimTrailingSlash, type FetchLike } from "@/lib/providers/http";
import { ProviderError } from "@/lib/providers/types";

export type AiConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxOutputTokens: number;
};

export type AiMessage = {
  role: "system" | "user";
  content: string;
};

function contentText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join("") : null;
  }
  return null;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

export async function completeJson(options: {
  config: AiConfig;
  messages: AiMessage[];
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}): Promise<unknown> {
  const { config } = options;
  if (!config.apiKey || !config.model) {
    throw new ProviderError("AI provider is not configured. Set AI_API_KEY and AI_MODEL.", {
      code: "CONFIGURATION",
      retryable: false,
    });
  }

  const body = await requestJson({
    provider: "AI provider",
    url: `${trimTrailingSlash(config.baseUrl)}/chat/completions`,
    method: "POST",
    headers: { authorization: `Bearer ${config.apiKey}` },
    body: {
      model: config.model,
      messages: options.messages,
      temperature: 0,
      max_tokens: config.maxOutputTokens,
      response_format: { type: "json_object" },
    },
    timeoutMs: config.timeoutMs,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ProviderError("AI provider returned an unexpected response shape.", {
      code: "INVALID_RESPONSE",
      retryable: true,
    });
  }

  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new ProviderError("AI provider returned no completion choices.", {
      code: "INVALID_RESPONSE",
      retryable: true,
    });
  }

  const first = choices[0] as {
    message?: { content?: unknown };
    finish_reason?: unknown;
  };
  if (first.finish_reason === "length") {
    throw new ProviderError(
      "AI output was truncated before valid JSON was complete. Increase AI_MAX_OUTPUT_TOKENS or shorten the input.",
      { code: "INVALID_RESPONSE", retryable: true },
    );
  }

  const content = contentText(first.message?.content);
  if (!content || !content.trim()) {
    throw new ProviderError("AI provider returned an empty message.", {
      code: "INVALID_RESPONSE",
      retryable: true,
    });
  }

  try {
    return JSON.parse(stripCodeFence(content));
  } catch {
    throw new ProviderError(
      "AI provider did not return valid JSON. Check the model's structured-output support.",
      { code: "INVALID_RESPONSE", retryable: true },
    );
  }
}
