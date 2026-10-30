import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    rateLimitBucket: {
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
    },
  },
}));

import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.deleteMany.mockReset();
    mocks.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("allows requests while the count is within the limit", async () => {
    mocks.upsert.mockResolvedValue({ count: 3 });
    const result = await checkRateLimit("login:1.2.3.4:a@b.co", 5, 900);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("blocks requests once the limit is exceeded", async () => {
    mocks.upsert.mockResolvedValue({ count: 6 });
    const result = await checkRateLimit("login:1.2.3.4:a@b.co", 5, 900);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("fails closed when the database is unavailable", async () => {
    mocks.upsert.mockRejectedValue(new Error("database down"));
    const result = await checkRateLimit("signup:1.2.3.4", 3, 3600);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });
});
