"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { getAuthContext, roleAtLeast } from "@/lib/auth/workspace";
import { formString } from "@/lib/form";

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
