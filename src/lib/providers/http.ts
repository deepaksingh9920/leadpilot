/**
 * Small JSON HTTP client shared by every provider adapter.
 *
 * Responsibilities: timeouts, status classification, provider-safe error
 * messages, and JSON parsing. It deliberately does not retry: the job queue
 * owns backoff, so a worker never sleeps while holding a lease.
 */

import { ProviderError, isRecord } from "@/lib/providers/types";

export type FetchLike = typeof fetch;

export type JsonRequest = {
  provider: string;
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  /** Optional caller signal, combined with the timeout. */
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
};

function retryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number.parseInt(raw, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 900);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.min(900, Math.ceil((date - Date.now()) / 1000)));
  }
  return undefined;
}

function providerMessage(body: unknown): string | null {
  if (!isRecord(body)) return null;
  for (const key of ["error", "message", "detail", "errors"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 300);
    if (isRecord(value)) {
      const nested = value.message ?? value.detail ?? value.code;
      if (typeof nested === "string" && nested.trim()) return nested.trim().slice(0, 300);
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === "string" && first.trim()) return first.trim().slice(0, 300);
      if (isRecord(first) && typeof first.message === "string") {
        return first.message.trim().slice(0, 300);
      }
    }
  }
  return null;
}

function classifyStatus(response: Response): {
  code: ProviderError["code"];
  retryable: boolean;
} {
  if (response.status === 401 || response.status === 403) {
    return { code: "AUTH", retryable: false };
  }
  if (response.status === 429) {
    return { code: "RATE_LIMIT", retryable: true };
  }
  if (
    response.status === 408 ||
    response.status === 425 ||
    response.status >= 500
  ) {
    return { code: "UPSTREAM", retryable: true };
  }
  if (response.status === 400 || response.status === 422) {
    return { code: "INVALID_RESPONSE", retryable: false };
  }
  return { code: "HTTP", retryable: false };
}

export async function requestJson(input: JsonRequest): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, input.timeoutMs));

  const external = input.signal;
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", forwardAbort, { once: true });
  }

  const fetchImpl: FetchLike = input.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(input.url, {
      method: input.method ?? "POST",
      headers: {
        accept: "application/json",
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        ...input.headers,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new ProviderError(
        `${input.provider} did not respond within ${Math.round(input.timeoutMs / 1000)}s.`,
        { code: "TIMEOUT", retryable: true },
      );
    }
    const detail = error instanceof Error ? error.message : "network request failed";
    throw new ProviderError(`${input.provider} request failed: ${detail.slice(0, 200)}`, {
      code: "UPSTREAM",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener("abort", forwardAbort);
  }

  const raw = await response.text();
  let parsed: unknown = null;
  if (raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (response.ok) {
        throw new ProviderError(`${input.provider} returned a non-JSON response.`, {
          code: "INVALID_RESPONSE",
          retryable: false,
          status: response.status,
        });
      }
    }
  }

  if (!response.ok) {
    const classified = classifyStatus(response);
    const detail = providerMessage(parsed);
    throw new ProviderError(
      `${input.provider} returned HTTP ${response.status}${detail ? `: ${detail}` : "."}`,
      {
        code: classified.code,
        retryable: classified.retryable,
        status: response.status,
        retryAfterSeconds: retryAfterSeconds(response),
      },
    );
  }

  return parsed;
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
