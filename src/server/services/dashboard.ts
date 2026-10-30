import "server-only";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getUsageSummary, METRIC_LABELS } from "@/server/services/workspaces";

const ACTION_LABELS: Record<string, string> = {
  "auth.signup": "Account created",
  "auth.login": "Signed in",
  "auth.email_verified": "Email verified",
  "auth.password_changed": "Password changed",
  "auth.password_reset_requested": "Password reset requested",
  "auth.password_reset_completed": "Password reset completed",
  "workspace.onboarding_completed": "Workspace onboarding completed",
  "workspace.profile_updated": "Workspace profile updated",
  "agent.toggled": "Agent setting changed",
  "plan.updated": "Plan configuration updated",
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll(".", " · ").replaceAll("_", " ");
}

export async function getDashboardData(workspaceId: string) {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);

  const [
    leadTotal,
    leadsThisMonth,
    verifiedLeads,
    activeCampaigns,
    draftCount,
    usage,
    agents,
    planAgents,
    agentConfigs,
    recentActivity,
    recentLeads,
    leadSourceCount,
    campaignCount,
    pendingReview,
  ] = await Promise.all([
    db.lead.count({ where: { workspaceId, deletedAt: null } }),
    db.lead.count({ where: { workspaceId, deletedAt: null, createdAt: { gte: monthStart } } }),
    db.lead.count({
      where: { workspaceId, deletedAt: null, verificationStatus: "VERIFIED" },
    }),
    db.campaign.count({ where: { workspaceId, status: "ACTIVE" } }),
    db.outreachMessage.count({
      where: { workspaceId, status: { in: ["DRAFT", "APPROVED"] } },
    }),
    getUsageSummary(workspaceId),
    db.agentDefinition.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.planAgent.findMany({
      where: { plan: { subscriptions: { some: { workspaceId } } } },
      select: { agentKey: true },
    }),
    db.agentConfig.findMany({ where: { workspaceId } }),
    db.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { name: true } } },
    }),
    db.lead.findMany({
      where: { workspaceId, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
    db.leadSource.count({ where: { workspaceId } }),
    db.campaign.count({ where: { workspaceId } }),
    db.lead.count({ where: { workspaceId, deletedAt: null, status: "NEW" } }),
  ]);

  const dayBuckets = new Map<string, number>();
  for (let index = 29; index >= 0; index -= 1) {
    const date = new Date(Date.now() - index * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    dayBuckets.set(key, 0);
  }
  for (const lead of recentLeads) {
    const key = lead.createdAt.toISOString().slice(0, 10);
    if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
  }
  const leadSeries = [...dayBuckets.entries()].map(([date, count]) => ({ date, count }));

  const allowedAgents = new Set(planAgents.map((item) => item.agentKey));
  const configByAgent = new Map(agentConfigs.map((config) => [config.agentKey, config]));

  return {
    stats: {
      leadTotal,
      leadsThisMonth,
      verifiedLeads,
      activeCampaigns,
      campaignCount,
      draftCount,
      pendingReview,
      leadSourceCount,
    },
    usage,
    agents: agents.map((agent) => ({
      key: agent.key,
      name: agent.name,
      description: agent.description,
      category: agent.category,
      requiresApproval: agent.requiresApproval,
      included: allowedAgents.has(agent.key),
      enabled: configByAgent.get(agent.key)?.enabled ?? false,
    })),
    activity: recentActivity.map((entry) => ({
      id: entry.id,
      action: auditActionLabel(entry.action),
      actor: entry.actor?.name ?? "System",
      createdAt: entry.createdAt,
    })),
    leadSeries,
    environment: {
      leadSourceConfigured: env.leadSourceConfigured,
      emailConfigured: env.emailConfigured,
      aiConfigured: env.aiConfigured,
      billingConfigured: env.billingConfigured,
    },
    metricLabels: METRIC_LABELS,
  };
}

export async function getAdminOverview() {
  const [plans, agents, workspaces, users, recentAudit] = await Promise.all([
    db.plan.findMany({
      orderBy: { sortOrder: "asc" },
      include: { limits: true, agents: true, _count: { select: { subscriptions: true } } },
    }),
    db.agentDefinition.findMany({ orderBy: { sortOrder: "asc" } }),
    db.workspace.count({ where: { deletedAt: null } }),
    db.user.count({ where: { disabledAt: null } }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        actor: { select: { name: true, email: true } },
        workspace: { select: { name: true } },
      },
    }),
  ]);

  return { plans, agents, workspaces, users, recentAudit };
}
