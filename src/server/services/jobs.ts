import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  canRetry,
  classifyJobError,
  JOB_LEASE_MS,
  MAX_JOB_ATTEMPTS,
  nextAvailableAt,
} from "@/lib/jobs/policy";
import { getAgentStatus } from "@/server/services/providers";
import { defaultJobExecutor } from "@/server/services/agents";
import { releaseUsage, reserveUsage } from "@/server/services/workspaces";

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 25;

export type CreateJobResult =
  | { ok: true; jobId: string }
  | { ok: false; code: "AGENT" | "PLAN" | "DISABLED" | "PROVIDER" | "LIMIT"; message: string };

export async function createJob(input: {
  workspaceId: string;
  userId: string;
  agentKey: string;
  input: Record<string, unknown>;
}): Promise<CreateJobResult> {
  const [agent, allowed, config, subscription] = await Promise.all([
    db.agentDefinition.findUnique({ where: { key: input.agentKey } }),
    db.planAgent.findFirst({
      where: {
        agentKey: input.agentKey,
        plan: { subscriptions: { some: { workspaceId: input.workspaceId } } },
      },
    }),
    db.agentConfig.findUnique({
      where: {
        workspaceId_agentKey: {
          workspaceId: input.workspaceId,
          agentKey: input.agentKey,
        },
      },
    }),
    db.subscription.findUnique({
      where: { workspaceId: input.workspaceId },
      include: { plan: { include: { limits: true } } },
    }),
  ]);

  if (!agent || !agent.isActive) {
    return { ok: false, code: "AGENT", message: "This agent is not available." };
  }
  if (!allowed) {
    return {
      ok: false,
      code: "PLAN",
      message: "This agent is not included in your current plan. Upgrade to run it.",
    };
  }
  if (!config?.enabled) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Enable this agent in the marketplace before starting a run.",
    };
  }

  const status = await getAgentStatus(agent.key, input.workspaceId);
  if (!status.runnable) {
    return { ok: false, code: "PROVIDER", message: status.message };
  }

  const runLimit =
    subscription?.plan.limits.find((limit) => limit.metric === "agent_runs_per_month")?.limit ?? 0;

  try {
    const job = await db.$transaction(async (tx) => {
      const reserved = await reserveUsage(
        tx,
        input.workspaceId,
        "agent_runs_per_month",
        1,
        runLimit,
      );
      if (!reserved.ok) throw new JobLimitError(reserved.reason);

      const created = await tx.job.create({
        data: {
          workspaceId: input.workspaceId,
          agentKey: input.agentKey,
          createdById: input.userId,
          input: JSON.stringify(input.input),
          maxAttempts: MAX_JOB_ATTEMPTS,
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorId: input.userId,
          action: "agent.run_queued",
          entityType: "Job",
          entityId: created.id,
          metadata: JSON.stringify({ agentKey: input.agentKey }),
        },
      });

      return created;
    });

    return { ok: true, jobId: job.id };
  } catch (error) {
    if (error instanceof JobLimitError) {
      return { ok: false, code: "LIMIT", message: error.message };
    }
    console.error("Failed to create job", error);
    return { ok: false, code: "AGENT", message: "The run could not be queued. Try again." };
  }
}

class JobLimitError extends Error {}

export type ClaimedJob = Prisma.JobGetPayload<{
  include: { agent: true; workspace: { select: { id: true; name: true } } };
}>;

/**
 * Releases leases held by workers that stopped responding, then atomically
 * claims due jobs one conditional update at a time. A job can only move from
 * QUEUED to RUNNING once, so two workers cannot execute the same row.
 */
export async function claimJobs(workerId: string, limit = DEFAULT_BATCH_SIZE): Promise<ClaimedJob[]> {
  const batch = Math.min(MAX_BATCH_SIZE, Math.max(1, limit));
  const now = new Date();

  await db.job.updateMany({
    where: { status: "RUNNING", leaseExpiresAt: { lt: now } },
    data: {
      status: "QUEUED",
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      availableAt: now,
    },
  });

  const candidates = await db.job.findMany({
    where: { status: "QUEUED", availableAt: { lte: now } },
    orderBy: { availableAt: "asc" },
    take: batch * 2,
    select: { id: true },
  });

  const claimed: ClaimedJob[] = [];
  for (const candidate of candidates) {
    if (claimed.length >= batch) break;
    const updated = await db.job.updateMany({
      where: { id: candidate.id, status: "QUEUED", availableAt: { lte: now } },
      data: {
        status: "RUNNING",
        attempts: { increment: 1 },
        lockedAt: now,
        lockedBy: workerId,
        leaseExpiresAt: new Date(now.getTime() + JOB_LEASE_MS),
        startedAt: now,
      },
    });
    if (updated.count !== 1) continue;

    const job = await db.job.findUnique({
      where: { id: candidate.id },
      include: { agent: true, workspace: { select: { id: true, name: true } } },
    });
    if (job) claimed.push(job);
  }

  return claimed;
}

export type JobExecutionContext = {
  jobId: string;
  workspaceId: string;
  agentKey: string;
  input: Record<string, unknown>;
  attempt: number;
  step: (
    name: string,
    status: "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED",
    detail?: Record<string, unknown>,
  ) => Promise<void>;
};

export type JobExecutor = (context: JobExecutionContext) => Promise<Record<string, unknown>>;

/** Executors live in server/services/agents and are keyed by agent. */
export { defaultJobExecutor };

export async function processJob(
  job: ClaimedJob,
  workerId: string,
  executor: JobExecutor = defaultJobExecutor,
): Promise<{ processed: boolean; status: string }> {
  const fresh = await db.job.findUnique({ where: { id: job.id } });
  if (!fresh || fresh.status !== "RUNNING" || fresh.lockedBy !== workerId) {
    return { processed: false, status: fresh?.status ?? "MISSING" };
  }

  const step = async (
    name: string,
    status: "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED",
    detail: Record<string, unknown> = {},
  ) => {
    const existing = await db.jobStep.findFirst({ where: { jobId: job.id, name } });
    const data = {
      status,
      detail: JSON.stringify(detail),
      attempt: fresh.attempts,
      startedAt: status === "RUNNING" ? new Date() : existing?.startedAt ?? new Date(),
      finishedAt: status === "RUNNING" ? null : new Date(),
    };
    if (existing) {
      await db.jobStep.update({ where: { id: existing.id }, data });
    } else {
      await db.jobStep.create({ data: { jobId: job.id, name, ...data } });
    }
  };

  let parsedInput: Record<string, unknown> = {};
  try {
    const value = JSON.parse(fresh.input);
    if (value && typeof value === "object" && !Array.isArray(value)) parsedInput = value;
  } catch {
    // Validation happens before queueing; an unreadable payload fails below.
  }

  try {
    await step("validate-input", "SUCCEEDED", { agentKey: job.agentKey });
    const result = await executor({
      jobId: job.id,
      workspaceId: job.workspaceId,
      agentKey: job.agentKey,
      input: parsedInput,
      attempt: fresh.attempts,
      step,
    });

    await db.job.updateMany({
      where: { id: job.id, status: "RUNNING" },
      data: {
        status: "SUCCEEDED",
        result: JSON.stringify(result ?? {}),
        error: null,
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
      },
    });
    return { processed: true, status: "SUCCEEDED" };
  } catch (error) {
    const message = truncateError(error);
    const outcome = classifyJobError(error);
    const retryable = outcome === "transient" && canRetry(fresh.attempts, fresh.maxAttempts);
    const failureDetail = {
      message,
      outcome,
      attempts: fresh.attempts,
      maxAttempts: fresh.maxAttempts,
    };

    await step("execute", "FAILED", failureDetail);

    if (retryable) {
      await db.job.updateMany({
        where: { id: job.id, status: "RUNNING" },
        data: {
          status: "QUEUED",
          error: message,
          availableAt: nextAvailableAt(fresh.attempts),
          lockedAt: null,
          lockedBy: null,
          leaseExpiresAt: null,
        },
      });
      return { processed: true, status: "QUEUED" };
    }

    await db.$transaction(async (tx) => {
      const updated = await tx.job.updateMany({
        where: { id: job.id, status: "RUNNING" },
        data: {
          status: "FAILED",
          error: message,
          finishedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          leaseExpiresAt: null,
        },
      });
      if (updated.count === 1) {
        await releaseUsage(tx, job.workspaceId, "agent_runs_per_month", 1);
        await tx.auditLog.create({
          data: {
            workspaceId: job.workspaceId,
            action: "agent.run_failed",
            entityType: "Job",
            entityId: job.id,
            metadata: JSON.stringify(failureDetail),
          },
        });
      }
    });

    return { processed: true, status: "FAILED" };
  }
}

export async function runWorker(options?: {
  workerId?: string;
  limit?: number;
  executor?: JobExecutor;
}) {
  const workerId = options?.workerId ?? `worker-${process.pid}-${Date.now()}`;
  const jobs = await claimJobs(workerId, options?.limit ?? DEFAULT_BATCH_SIZE);
  const results: { jobId: string; status: string }[] = [];

  for (const job of jobs) {
    const result = await processJob(job, workerId, options?.executor);
    results.push({ jobId: job.id, status: result.status });
  }

  return { workerId, claimed: jobs.length, results };
}

export async function cancelJob(input: {
  workspaceId: string;
  jobId: string;
  actorId: string;
}) {
  const job = await db.job.findFirst({
    where: { id: input.jobId, workspaceId: input.workspaceId },
  });
  if (!job) return { ok: false as const, message: "Run not found." };
  if (job.status !== "QUEUED" && job.status !== "RUNNING") {
    return { ok: false as const, message: "This run has already finished." };
  }

  const updated = await db.job.updateMany({
    where: { id: job.id, status: { in: ["QUEUED", "RUNNING"] } },
    data: {
      status: "CANCELLED",
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
    },
  });
  if (updated.count !== 1) {
    return { ok: false as const, message: "This run has already finished." };
  }

  await db.$transaction(async (tx) => {
    await releaseUsage(tx, input.workspaceId, "agent_runs_per_month", 1);
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "agent.run_cancelled",
        entityType: "Job",
        entityId: job.id,
        metadata: JSON.stringify({ agentKey: job.agentKey }),
      },
    });
  });

  return { ok: true as const };
}

export async function getJobDetail(workspaceId: string, jobId: string) {
  return db.job.findFirst({
    where: { id: jobId, workspaceId },
    include: {
      agent: true,
      createdBy: { select: { name: true } },
      steps: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function getJobsForWorkspace(workspaceId: string, take = 20) {
  return db.job.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      agent: { select: { name: true, icon: true, key: true } },
      _count: { select: { steps: true } },
    },
  });
}

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}
