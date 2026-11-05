import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRunnableAgent, createTempDatabase, createTestTenant } from "@/test/temp-db";

// A queue-only build cannot create jobs, so these tests opt into the runtime flag
// and use an injected executor. No provider adapter is called.
const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;
process.env.AGENT_RUNTIME_READY = "true";
process.env.AI_API_KEY = "test-key";
process.env.AI_MODEL = "test-model";

const { db } = await import("@/lib/db");
const { cancelJob, claimJobs, createJob, processJob } = await import(
  "@/server/services/jobs"
);
const { PermanentJobError, TransientJobError } = await import("@/lib/jobs/policy");

const AGENT_KEY = "LEAD_QUALIFICATION";

let tenant: Awaited<ReturnType<typeof createTestTenant>>;

async function runUsage(): Promise<number> {
  const counter = await db.usageCounter.findFirst({
    where: { workspaceId: tenant.workspace.id, metric: "agent_runs_per_month" },
  });
  return counter?.used ?? 0;
}

async function queueJob(): Promise<string> {
  const result = await createJob({
    workspaceId: tenant.workspace.id,
    userId: tenant.user.id,
    agentKey: AGENT_KEY,
    input: { leadIds: ["lead_1"] },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.jobId;
}

async function makeDue(jobId: string): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: { availableAt: new Date(Date.now() - 60_000) },
  });
}

const successExecutor = async ({
  step,
}: {
  step: (
    name: string,
    status: "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED",
    detail?: Record<string, unknown>,
  ) => Promise<void>;
}) => {
  await step("execute", "SUCCEEDED", { checked: true });
  return { qualified: 1 };
};

beforeAll(async () => {
  tenant = await createTestTenant(db, { key: "jobs", runLimit: 25 });
  await createRunnableAgent(db, {
    workspaceId: tenant.workspace.id,
    planId: tenant.plan.id,
    key: AGENT_KEY,
    slug: `qualification-${Date.now()}`,
  });
});

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

describe("job queue", () => {
  it("queues a job and reserves one run", async () => {
    const before = await runUsage();
    const jobId = await queueJob();

    const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("QUEUED");
    expect(job.attempts).toBe(0);
    expect(job.maxAttempts).toBe(3);
    expect(await runUsage()).toBe(before + 1);
  });

  it("claims a due job exactly once across workers", async () => {
    const jobId = await queueJob();

    const first = await claimJobs("worker-a", 5);
    expect(first.map((job) => job.id)).toContain(jobId);
    const claimed = first.find((job) => job.id === jobId)!;
    expect(claimed.attempts).toBe(1);
    expect(claimed.lockedBy).toBe("worker-a");
    expect(claimed.leaseExpiresAt).not.toBeNull();

    const second = await claimJobs("worker-b", 5);
    expect(second.map((job) => job.id)).not.toContain(jobId);

    // A worker that does not hold the lease cannot process the job.
    const wrong = await processJob(claimed, "worker-b", successExecutor);
    expect(wrong.processed).toBe(false);
    expect(wrong.status).toBe("RUNNING");
  });

  it("completes a job and records its steps", async () => {
    const jobId = await queueJob();
    const before = await runUsage();
    const [claimed] = await claimJobs("worker-c", 5);
    expect(claimed?.id).toBe(jobId);

    const result = await processJob(claimed!, "worker-c", successExecutor);
    expect(result).toEqual({ processed: true, status: "SUCCEEDED" });

    const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("SUCCEEDED");
    expect(job.result).toBe(JSON.stringify({ qualified: 1 }));
    expect(job.finishedAt).not.toBeNull();
    expect(job.lockedBy).toBeNull();
    expect(await runUsage()).toBe(before);

    const steps = await db.jobStep.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    });
    expect(steps.map((step) => step.name)).toEqual(["validate-input", "execute"]);
    expect(steps.every((step) => step.status === "SUCCEEDED")).toBe(true);
  });

  it("retries a transient failure, then succeeds without double-charging", async () => {
    const jobId = await queueJob();
    const before = await runUsage();
    const [claimed] = await claimJobs("worker-d", 5);

    const failed = await processJob(claimed!, "worker-d", async () => {
      throw new TransientJobError("provider rate limited");
    });
    expect(failed).toEqual({ processed: true, status: "QUEUED" });

    const queued = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(queued.status).toBe("QUEUED");
    expect(queued.attempts).toBe(1);
    expect(queued.error).toBe("provider rate limited");
    expect(queued.availableAt.getTime()).toBeGreaterThan(Date.now());

    const step = await db.jobStep.findFirst({
      where: { jobId, name: "execute" },
    });
    expect(step?.status).toBe("FAILED");
    expect(step?.attempt).toBe(1);

    await makeDue(jobId);
    const [retried] = await claimJobs("worker-e", 5);
    expect(retried?.id).toBe(jobId);
    expect(retried?.attempts).toBe(2);

    const succeeded = await processJob(retried!, "worker-e", successExecutor);
    expect(succeeded.status).toBe("SUCCEEDED");
    expect(await runUsage()).toBe(before);
  });

  it("fails permanently and refunds the reserved run", async () => {
    const jobId = await queueJob();
    const before = await runUsage();
    const [claimed] = await claimJobs("worker-f", 5);

    const failed = await processJob(claimed!, "worker-f", async () => {
      throw new PermanentJobError("invalid input");
    });
    expect(failed).toEqual({ processed: true, status: "FAILED" });

    const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("FAILED");
    expect(job.error).toBe("invalid input");
    expect(await runUsage()).toBe(before - 1);

    const audit = await db.auditLog.findFirst({
      where: { entityId: jobId, action: "agent.run_failed" },
    });
    expect(audit).not.toBeNull();
  });

  it("stops retrying once attempts are exhausted and refunds", async () => {
    const jobId = await queueJob();
    const before = await runUsage();
    const [claimed] = await claimJobs("worker-g", 5);

    // Simulate two earlier failed attempts.
    await db.job.update({ where: { id: jobId }, data: { attempts: 3 } });

    const failed = await processJob(claimed!, "worker-g", async () => {
      throw new TransientJobError("still unavailable");
    });
    expect(failed.status).toBe("FAILED");
    expect(await runUsage()).toBe(before - 1);

    const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("FAILED");
    expect(job.attempts).toBe(3);
  });

  it("cancels a queued job and refunds exactly once", async () => {
    const jobId = await queueJob();
    const before = await runUsage();

    const first = await cancelJob({
      workspaceId: tenant.workspace.id,
      jobId,
      actorId: tenant.user.id,
    });
    expect(first.ok).toBe(true);

    const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("CANCELLED");
    expect(await runUsage()).toBe(before - 1);

    const second = await cancelJob({
      workspaceId: tenant.workspace.id,
      jobId,
      actorId: tenant.user.id,
    });
    expect(second.ok).toBe(false);
    expect(await runUsage()).toBe(before - 1);
  });

  it("cancelling a running job prevents the worker from completing it", async () => {
    const jobId = await queueJob();
    const before = await runUsage();
    const [claimed] = await claimJobs("worker-h", 5);

    const cancelled = await cancelJob({
      workspaceId: tenant.workspace.id,
      jobId,
      actorId: tenant.user.id,
    });
    expect(cancelled.ok).toBe(true);
    expect(await runUsage()).toBe(before - 1);

    const result = await processJob(claimed!, "worker-h", successExecutor);
    expect(result.processed).toBe(false);
    expect(result.status).toBe("CANCELLED");

    const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("CANCELLED");
    expect(await runUsage()).toBe(before - 1);
  });

  it("refuses to queue a job when the monthly run limit is reached", async () => {
    const capped = await createTestTenant(db, { key: "jobs-capped", runLimit: 0 });
    await createRunnableAgent(db, {
      workspaceId: capped.workspace.id,
      planId: capped.plan.id,
      key: AGENT_KEY,
      slug: `qualification-capped-${Date.now()}`,
    });

    const result = await createJob({
      workspaceId: capped.workspace.id,
      userId: capped.user.id,
      agentKey: AGENT_KEY,
      input: { leadIds: ["lead_1"] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("LIMIT");
    expect(await db.job.count({ where: { workspaceId: capped.workspace.id } })).toBe(0);
  });
});
