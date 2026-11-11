import "server-only";

import { env } from "@/lib/env";

/**
 * Minimal database surface the probe needs. Keeping it structural lets tests pass
 * a stub without standing up Prisma while the route passes the real client.
 */
export type DatabaseProbe = {
  $queryRawUnsafe: (query: string) => Promise<unknown>;
};

export type ProviderStatus = "configured" | "not_configured";

export type ProviderHealth = {
  leadSource: ProviderStatus;
  ai: ProviderStatus;
  email: ProviderStatus;
  billing: ProviderStatus;
  billingWebhooks: ProviderStatus;
  worker: ProviderStatus;
  agentRuntime: "ready" | "disabled";
};

export type HealthConfig = {
  leadSourceConfigured: boolean;
  aiConfigured: boolean;
  emailConfigured: boolean;
  billingConfigured: boolean;
  billingWebhooksConfigured: boolean;
  workerConfigured: boolean;
  agentRuntimeReady: boolean;
};

export type HealthReport = {
  status: "ok" | "degraded";
  service: "leadpilot";
  database: "ok" | "unavailable";
  databaseLatencyMs: number;
  providers: ProviderHealth;
  checkedAt: string;
};

export const healthConfigFromEnv: HealthConfig = {
  leadSourceConfigured: env.leadSourceConfigured,
  aiConfigured: env.aiConfigured,
  emailConfigured: env.emailConfigured,
  billingConfigured: env.billingConfigured,
  billingWebhooksConfigured: env.billingWebhooksConfigured,
  workerConfigured: Boolean(env.workerSecret),
  agentRuntimeReady: env.agentRuntimeReady,
};

/**
 * Maps configuration flags to coarse statuses. Keys and URLs are deliberately
 * excluded so an unauthenticated probe never leaks configuration values.
 */
export function describeProviders(config: HealthConfig): ProviderHealth {
  const status = (configured: boolean): ProviderStatus =>
    configured ? "configured" : "not_configured";

  return {
    leadSource: status(config.leadSourceConfigured),
    ai: status(config.aiConfigured),
    email: status(config.emailConfigured),
    billing: status(config.billingConfigured),
    billingWebhooks: status(config.billingWebhooksConfigured),
    worker: status(config.workerConfigured),
    agentRuntime: config.agentRuntimeReady ? "ready" : "disabled",
  };
}

/**
 * Readiness probe for deployment platforms. A failed database query degrades the
 * report and never throws, so the endpoint stays response-shaped during outages.
 */
export async function collectHealth(
  client: DatabaseProbe,
  options: { config?: HealthConfig; now?: () => number } = {},
): Promise<HealthReport> {
  const config = options.config ?? healthConfigFromEnv;
  const now = options.now ?? Date.now;
  const startedAt = now();

  let database: HealthReport["database"] = "ok";
  try {
    await client.$queryRawUnsafe("SELECT 1");
  } catch (error) {
    database = "unavailable";
    console.error(
      "[health] database probe failed",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  return {
    status: database === "ok" ? "ok" : "degraded",
    service: "leadpilot",
    database,
    databaseLatencyMs: Math.max(0, now() - startedAt),
    providers: describeProviders(config),
    checkedAt: new Date().toISOString(),
  };
}
