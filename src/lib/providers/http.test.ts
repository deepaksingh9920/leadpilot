import { describe, expect, it, vi } from "vitest";

import { requestJson, type FetchLike } from "@/lib/providers/http";
import { ProviderError } from "@/lib/providers/types";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const base = {
  provider: "Test provider",
  url: "https://provider.test/search",
  timeoutMs: 5_000,
};

describe("provider HTTP client", () => {
  it("sends JSON with provider headers and returns the parsed body", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json({ ok: true }));

    const result = await requestJson({
      ...base,
      headers: { "x-api-key": "secret-key" },
      body: { query: "saas" },
      fetchImpl,
    });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(base.url);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": "secret-key",
    });
    expect(init?.body).toBe(JSON.stringify({ query: "saas" }));
  });

  it("times out and reports a retryable failure", async () => {
    const fetchImpl: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });

    await expect(
      requestJson({ ...base, timeoutMs: 10, fetchImpl }),
    ).rejects.toMatchObject({ code: "TIMEOUT", retryable: true });
  });

  it("maps authentication failures to permanent errors without leaking the key", async () => {
    const fetchImpl: FetchLike = async () =>
      json({ error: "invalid api key" }, 401);

    const error = await requestJson({
      ...base,
      headers: { "x-api-key": "super-secret" },
      fetchImpl,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ code: "AUTH", retryable: false, status: 401 });
    expect((error as Error).message).toContain("invalid api key");
    expect((error as Error).message).not.toContain("super-secret");
  });

  it("maps rate limits to a retryable error and keeps Retry-After", async () => {
    const fetchImpl: FetchLike = async () =>
      json({ message: "slow down" }, 429, { "retry-after": "7" });

    await expect(requestJson({ ...base, fetchImpl })).rejects.toMatchObject({
      code: "RATE_LIMIT",
      retryable: true,
      retryAfterSeconds: 7,
    });
  });

  it("rejects a successful response that is not JSON", async () => {
    const fetchImpl: FetchLike = async () => new Response("<html>gateway</html>", { status: 200 });

    await expect(requestJson({ ...base, fetchImpl })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: false,
    });
  });

  it("maps network failures to transient upstream errors", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };

    await expect(requestJson({ ...base, fetchImpl })).rejects.toMatchObject({
      code: "UPSTREAM",
      retryable: true,
    });
  });
});
