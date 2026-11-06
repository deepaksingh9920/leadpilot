import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Creates a throwaway SQLite database with the real Prisma schema so service
 * tests exercise actual transactions, unique constraints, and usage counters.
 * The schema is pushed from prisma/schema.prisma, not hand-written DDL.
 */
export function createTempDatabase(): {
  url: string;
  file: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(path.join(tmpdir(), "leadpilot-test-"));
  const file = path.join(dir, "test.db");
  const url = `file:${file.replaceAll("\\", "/")}`;
  const prismaBin = path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma",
  );

  execSync(`"${prismaBin}" db push --skip-generate --schema prisma/schema.prisma`, {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: "test" },
    stdio: "pipe",
  });

  return {
    url,
    file,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // A locked SQLite file on Windows is not worth failing a test run over.
      }
    },
  };
}

/**
 * Minimal but realistic tenant: owner, workspace, subscription, plan limits,
 * and usage counters anchored to the current period.
 */
export async function createTestTenant(
  db: import("@prisma/client").PrismaClient,
  options: {
    key: string;
    leadLimit?: number;
    runLimit?: number;
    exportLimit?: number;
    sendLimit?: number;
  },
) {
  const suffix = `${options.key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await db.user.create({
    data: {
      email: `owner-${suffix}@example.test`,
      passwordHash: "not-a-real-hash",
      name: "Test Owner",
      emailVerifiedAt: new Date(),
    },
  });

  const plan = await db.plan.create({
    data: {
      key: `test-${suffix}`,
      name: "Test plan",
      description: "Fixture plan",
      limits: {
        create: [
          { metric: "leads_per_month", limit: options.leadLimit ?? 100 },
          { metric: "agent_runs_per_month", limit: options.runLimit ?? 10 },
          { metric: "exports_per_month", limit: options.exportLimit ?? 5 },
          { metric: "sends_per_day", limit: options.sendLimit ?? 20 },
        ],
      },
    },
  });

  const workspace = await db.workspace.create({
    data: {
      name: "Test workspace",
      slug: `test-${suffix}`,
      ownerId: user.id,
      onboardedAt: new Date(),
      subscription: {
        create: { planId: plan.id, status: "ACTIVE", provider: "internal" },
      },
      memberships: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  return { user, plan, workspace };
}

/** Seeds the agent definition, plan access, and workspace config a job needs. */
export async function createRunnableAgent(
  db: import("@prisma/client").PrismaClient,
  input: { workspaceId: string; planId: string; key: string; slug: string },
) {
  await db.agentDefinition.upsert({
    where: { key: input.key },
    update: {},
    create: {
      key: input.key,
      name: "Qualification test agent",
      slug: input.slug,
      description: "Fixture agent",
      category: "Qualification",
      stage: "qualify",
      icon: "gauge",
      inputSchema: JSON.stringify({
        type: "object",
        properties: { leadIds: { type: "array" } },
        required: ["leadIds"],
      }),
    },
  });

  await db.planAgent.create({
    data: { planId: input.planId, agentKey: input.key },
  });

  await db.agentConfig.create({
    data: { workspaceId: input.workspaceId, agentKey: input.key, enabled: true },
  });
}
