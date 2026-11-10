"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { RATE_LIMITS, rateLimitMessage } from "@/lib/auth/rate-limits";
import { getAuthContext, roleAtLeast } from "@/lib/auth/workspace";
import { formString, type FormState } from "@/lib/form";
import { parseAgentInputSchema, validateAgentInput } from "@/lib/agents/input-schema";
import { cancelJob, createJob } from "@/server/services/jobs";

export async function toggleAgentAction(formData: FormData): Promise<void> {
  const context = await getAuthContext();
  if (!context?.workspace) redirect("/login");
  if (!roleAtLeast(context.role, "ADMIN")) redirect("/agents");

  const agentKey = formString(formData, "agentKey");
  const enable = formString(formData, "enable") === "true";

  const agent = await db.agentDefinition.findUnique({ where: { key: agentKey } });
  if (!agent || !agent.isActive) redirect("/agents");

  const allowed = await db.planAgent.findFirst({
    where: {
      agentKey,
      plan: {
        subscriptions: { some: { workspaceId: context.workspace.id } },
      },
    },
  });
  if (!allowed) redirect("/agents");

  await db.$transaction(async (tx) => {
    await tx.agentConfig.upsert({
      where: {
        workspaceId_agentKey: { workspaceId: context.workspace!.id, agentKey },
      },
      update: { enabled: enable },
      create: {
        workspaceId: context.workspace!.id,
        agentKey,
        enabled: enable,
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: context.workspace!.id,
        actorId: context.user.id,
        action: "agent.toggled",
        entityType: "AgentConfig",
        entityId: agentKey,
        metadata: JSON.stringify({ agentKey, enabled: enable }),
      },
    });
  });

  revalidatePath("/agents");
  revalidatePath("/dashboard");
}

export async function runAgentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "MEMBER")) {
    return { status: "error", message: "You do not have permission to run agents." };
  }

  const limit = await checkRateLimit(
    `agent-run:${context.user.id}`,
    RATE_LIMITS.agentRun.limit,
    RATE_LIMITS.agentRun.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const agentKey = formString(formData, "agentKey");
  const agent = await db.agentDefinition.findUnique({ where: { key: agentKey } });
  if (!agent || !agent.isActive) {
    return { status: "error", message: "This agent is not available." };
  }

  const schema = parseAgentInputSchema(agent.inputSchema);
  if (schema.parseError) {
    return { status: "error", message: schema.parseError };
  }

  const raw: Record<string, string[]> = {};
  for (const property of schema.properties) {
    raw[property.name] = formData
      .getAll(property.name)
      .filter((value): value is string => typeof value === "string");
  }

  const validated = validateAgentInput(schema, raw);
  if (!validated.ok) {
    return { status: "error", fieldErrors: validated.errors };
  }

  const result = await createJob({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    agentKey,
    input: validated.value,
  });

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  redirect(`/runs/${result.jobId}`);
}

export async function cancelRunAction(formData: FormData): Promise<void> {
  const context = await getAuthContext();
  if (!context?.workspace) redirect("/login");
  if (!roleAtLeast(context.role, "MEMBER")) redirect("/agents");

  const jobId = formString(formData, "jobId");
  await cancelJob({
    workspaceId: context.workspace.id,
    jobId,
    actorId: context.user.id,
  });

  revalidatePath(`/runs/${jobId}`);
  revalidatePath("/agents");
}
