import "server-only";

import { db } from "@/lib/db";
import type { PublicPlan } from "@/components/marketing/pricing-table";

export async function getPublicPlans(): Promise<PublicPlan[]> {
  const plans = await db.plan.findMany({
    where: { isPublic: true, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      limits: true,
      agents: true,
    },
  });

  return plans.map((plan) => ({
    id: plan.id,
    key: plan.key,
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    currency: plan.currency,
    limits: Object.fromEntries(plan.limits.map((limit) => [limit.metric, limit.limit])),
    agentCount: plan.agents.length,
  }));
}

export async function getActiveAgents() {
  return db.agentDefinition.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}
