import { describe, expect, it } from "vitest";

import { completeJson, type AiConfig } from "@/lib/providers/ai";
import type { FetchLike } from "@/lib/providers/http";

function completion(content: unknown, finishReason = "stop"): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: finishReason }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const config: AiConfig = {
  apiKey: "ai-secret",
  model: "test-model",
  baseUrl: "https://ai.test/v1/",
  timeoutMs: 5_000,
  maxOutputTokens: 321,
};

const messages = [
  { role: "system" as const, content: "Be precise." },
  { role: "user" as const, content: "Return JSON." },
];

function captureFetch(response: Response): {
  fetchImpl: FetchLike;
  calls: { url: string; init: RequestInit | undefined }[];
} {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ url: String(input), init });
    return response;
  };
  return { fetchImpl, calls };
}

describe("OpenAI-compatible AI adapter", () => {
  it("sends a JSON-only chat completion request", async () => {
    const { fetchImpl, calls } = captureFetch(completion('{"answer":42}'));

    const output = await completeJson({ config, messages, fetchImpl });

    expect(output).toEqual({ answer: 42 });
    expect(calls[0].url).toBe("https://ai.test/v1/chat/completions");
    expect(calls[0].init?.headers).toMatchObject({
      authorization: "Bearer ai-secret",
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      model: "test-model",
      messages,
      temperature: 0,
      max_tokens: 321,
      response_format: { type: "json_object" },
    });
  });

  it("unwraps a fenced JSON code block", async () => {
    const { fetchImpl } = captureFetch(completion('```json\n{"a":1}\n```'));

    await expect(completeJson({ config, messages, fetchImpl })).resolves.toEqual({ a: 1 });
  });

  it("joins array-shaped message content", async () => {
    const { fetchImpl } = captureFetch(
      completion([
        { type: "text", text: '{"b":' },
        { type: "text", text: "2}" },
      ]),
    );

    await expect(completeJson({ config, messages, fetchImpl })).resolves.toEqual({ b: 2 });
  });

  it("reports truncation as a retryable dependency failure", async () => {
    const { fetchImpl } = captureFetch(completion('{"partial":', "length"));

    await expect(completeJson({ config, messages, fetchImpl })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: true,
    });
  });

  it("rejects empty content", async () => {
    const { fetchImpl } = captureFetch(completion("   "));

    await expect(completeJson({ config, messages, fetchImpl })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: true,
    });
  });

  it("rejects non-JSON content", async () => {
    const { fetchImpl } = captureFetch(completion("Here is your answer: yes"));

    await expect(completeJson({ config, messages, fetchImpl })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: true,
    });
  });

  it("rejects a response with no choices", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    await expect(completeJson({ config, messages, fetchImpl })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects a non-object response body", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    await expect(completeJson({ config, messages, fetchImpl })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("refuses to call a provider without credentials", async () => {
    await expect(
      completeJson({
        config: { ...config, apiKey: "" },
        messages,
        fetchImpl: async () => completion('{"ok":true}'),
      }),
    ).rejects.toMatchObject({ code: "CONFIGURATION", retryable: false });
  });
});
