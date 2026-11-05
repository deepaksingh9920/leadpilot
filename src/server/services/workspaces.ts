import "server-only";

import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { slugify, startOfMonthUTC } from "@/lib/utils";
import { db } from "@/lib/db";

export const USAGE_METRICS = [
  "leads_per_month",
  "agent_runs_per_month",
  "exports_per_month",
  "sends_per_day",
] as const;

export const METRIC_LABELS: Record<string, string> = {
  leads_per_month: "Leads discovered",
  agent_runs_per_month: "Agent runs",
  seats: "Team seats",
  workspaces: "Client workspaces",
  sends_per_day: "Emails sent today",
  exports_per_month: "Lead exports",
};

export const METRIC_PERIODS: Record<string, "month" | "day" | "seat" | "workspace"> = {
  leads_per_month: "month",
  agent_runs_per_month: "month",
  exports_per_month: "month",
  sends_per_day: "day",
  seats: "seat",
  workspaces: "workspace",
};

export function periodStartForMetric(metric: string): Date {
  if (METRIC_PERIODS[metric] === "day") {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  return startOfMonthUTC();
}

export async function getUsageSummary(
  workspaceId: string,
  metrics: readonly string[] = USAGE_METRICS,
): Promise<Record<string, number>> {
  const rows = await db.usageCounter.findMany({
    where: {
      workspaceId,
      metric: { in: [...metrics] },
      periodStart: {
        in: [...new Set(metrics.map((metric) => periodStartForMetric(metric)))],
      },
    },
  });

  const usage: Record<string, number> = {};
  for (const metric of metrics) usage[metric] = 0;
  for (const row of rows) usage[row.metric] = row.used;
  return usage;
}

export async function reserveUsage(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  metric: string,
  amount: number,
  limit: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const periodStart = periodStartForMetric(metric);
  const existing = await tx.usageCounter.findUnique({
    where: { workspaceId_metric_periodStart: { workspaceId, metric, periodStart } },
  });

  const used = existing?.used ?? 0;
  if (used + amount > limit) {
    return { ok: false, reason: `${METRIC_LABELS[metric] ?? metric} limit reached.` };
  }

  await tx.usageCounter.upsert({
    where: { workspaceId_metric_periodStart: { workspaceId, metric, periodStart } },
    create: { workspaceId, metric, periodStart, used: amount },
    update: { used: { increment: amount } },
  });

  return { ok: true };
}

/**
 * Returns reserved usage after a cancelled or permanently failed action so plan
 * counters reconcile instead of leaking capacity.
 */
export async function releaseUsage(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  metric: string,
  amount: number,
): Promise<void> {
  const periodStart = periodStartForMetric(metric);
  const existing = await tx.usageCounter.findUnique({
    where: { workspaceId_metric_periodStart: { workspaceId, metric, periodStart } },
  });
  if (!existing) return;

  await tx.usageCounter.update({
    where: { id: existing.id },
    data: { used: Math.max(0, existing.used - amount) },
  });
}

export type WorkspaceLimits = Record<string, number>;

export async function getWorkspaceLimits(workspaceId: string): Promise<WorkspaceLimits> {
  const subscription = await db.subscription.findUnique({
    where: { workspaceId },
    include: { plan: { include: { limits: true } } },
  });
  const limits: WorkspaceLimits = {};
  for (const limit of subscription?.plan.limits ?? []) limits[limit.metric] = limit.limit;
  return limits;
}

type CreateWorkspaceInput = {
  ownerId: string;
  name: string;
  onboardedAt?: Date | null;
};

export async function createWorkspaceWithDefaults(
  tx: Prisma.TransactionClient,
  input: CreateWorkspaceInput,
): Promise<{ workspaceId: string }> {
  const freePlan = await tx.plan.findUnique({ where: { key: "free" } });
  if (!freePlan) {
    throw new Error("Free plan is missing. Run the database seed before creating accounts.");
  }

  const base = slugify(input.name) || "workspace";
  const slug = `${base}-${randomBytes(3).toString("hex")}`;

  const workspace = await tx.workspace.create({
    data: {
      name: input.name,
      slug,
      ownerId: input.ownerId,
      onboardedAt: input.onboardedAt ?? null,
      profile: { create: { companyName: input.name } },
      subscription: {
        create: {
          planId: freePlan.id,
          status: "ACTIVE",
          provider: "internal",
        },
      },
    },
  });

  await tx.membership.create({
    data: { workspaceId: workspace.id, userId: input.ownerId, role: "OWNER" },
  });

  // One counter per metric, each anchored to that metric's own period. Deduplicating
  // Date objects directly would not work: two equal timestamps are distinct objects,
  // which previously produced duplicate rows and tripped the unique constraint.
  await tx.usageCounter.createMany({
    data: USAGE_METRICS.map((metric) => ({
      workspaceId: workspace.id,
      metric,
      periodStart: periodStartForMetric(metric),
      used: 0,
    })),
  });

  return { workspaceId: workspace.id };
}
