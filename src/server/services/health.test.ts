import { describe, expect, it, vi } from "vitest";

import {
  collectHealth,
  describeProviders,
  type HealthConfig,
} from "./health";

const unconfigured: HealthConfig = {
  leadSourceConfigured: false,
  aiConfigured: false,
  emailConfigured: false,
  billingConfigured: false,
  billingWebhooksConfigured: false,
  workerConfigured: false,
  credentialStorageConfigured: false,
  agentRuntimeReady: false,
};

const fullyConfigured: HealthConfig = {
  leadSourceConfigured: true,
  aiConfigured: true,
  emailConfigured: true,
  billingConfigured: true,
  billingWebhooksConfigured: true,
  workerConfigured: true,
  credentialStorageConfigured: true,
  agentRuntimeReady: true,
};

function probe(implementation: () => Promise<unknown>) {
  return { $queryRawUnsafe: vi.fn(implementation) };
}

describe("health probe", () => {
  it("reports ok with a latency measurement when the database responds", async () => {
    const client = probe(async () => [{ ok: 1 }]);
    const clock = [1_000, 1_042];
    const report = await collectHealth(client, {
      config: fullyConfigured,
      now: () => clock.shift() ?? 1_042,
    });

    expect(client.$queryRawUnsafe).toHaveBeenCalledWith("SELECT 1");
    expect(report).toMatchObject({
      status: "ok",
      service: "leadpilot",
      database: "ok",
      databaseLatencyMs: 42,
    });
    expect(Number.isNaN(Date.parse(report.checkedAt))).toBe(false);
  });

  it("degrades instead of throwing when the database probe fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const report = await collectHealth(probe(async () => Promise.reject(new Error("down"))), {
      config: unconfigured,
    });

    expect(report.status).toBe("degraded");
    expect(report.database).toBe("unavailable");
    expect(report.providers).toEqual({
      leadSource: "not_configured",
      ai: "not_configured",
      email: "not_configured",
      billing: "not_configured",
      billingWebhooks: "not_configured",
      worker: "not_configured",
      credentialStorage: "not_configured",
      agentRuntime: "disabled",
    });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("maps configured flags without exposing keys or secrets", async () => {
    const providers = describeProviders(fullyConfigured);
    expect(providers).toEqual({
      leadSource: "configured",
      ai: "configured",
      email: "configured",
      billing: "configured",
      billingWebhooks: "configured",
      worker: "configured",
      credentialStorage: "configured",
      agentRuntime: "ready",
    });

    const report = await collectHealth(probe(async () => []), {
      config: fullyConfigured,
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/api[_-]?key|secret|password|postgres(ql)?:\/\//i);
  });

  it("keeps a non-negative latency when the clock is coarse", async () => {
    const report = await collectHealth(probe(async () => []), {
      config: unconfigured,
      now: () => 500,
    });
    expect(report.databaseLatencyMs).toBe(0);
  });
});
