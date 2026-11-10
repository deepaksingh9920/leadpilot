import { describe, expect, it } from "vitest";

import { isWorkerAuthorized } from "./worker-auth";

const SECRET = "worker-secret-for-tests";

describe("isWorkerAuthorized", () => {
  it("accepts a matching Bearer token", () => {
    expect(
      isWorkerAuthorized(SECRET, { authorization: `Bearer ${SECRET}` }),
    ).toBe(true);
  });

  it("accepts a matching x-worker-secret header", () => {
    expect(isWorkerAuthorized(SECRET, { workerSecret: SECRET })).toBe(true);
  });

  it("is case-insensitive for the Bearer scheme", () => {
    expect(
      isWorkerAuthorized(SECRET, { authorization: `bearer ${SECRET}` }),
    ).toBe(true);
  });

  it("rejects missing, wrong, or truncated secrets", () => {
    expect(isWorkerAuthorized(SECRET, {})).toBe(false);
    expect(isWorkerAuthorized(SECRET, { authorization: "Bearer wrong-secret" })).toBe(false);
    expect(isWorkerAuthorized(SECRET, { workerSecret: SECRET.slice(0, -1) })).toBe(false);
    expect(isWorkerAuthorized(SECRET, { workerSecret: `${SECRET}extra` })).toBe(false);
  });

  it("stays disabled when the server secret is not configured", () => {
    expect(isWorkerAuthorized(undefined, { authorization: "Bearer anything" })).toBe(false);
    expect(isWorkerAuthorized("", { workerSecret: "" })).toBe(false);
  });
});
