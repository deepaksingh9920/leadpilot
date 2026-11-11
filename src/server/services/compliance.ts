import "server-only";

import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/auth/audit";
import { verifyPassword } from "@/lib/auth/password";
import {
  APPROVAL_POLICIES,
  isApprovalPolicy,
  parseRetentionDays,
  purgeCutoff,
  retentionCutoff,
  SOFT_DELETE_GRACE_DAYS,
} from "@/lib/compliance/settings";

export type ComplianceFailure = {
  ok: false;
  code: "NOT_FOUND" | "INVALID" | "CONFLICT";
  message: string;
};

export type ComplianceSettingsInput = {
  workspaceId: string;
  actorId: string;
  retentionDays: unknown;
  approvalPolicy: unknown;
  ip?: string;
  userAgent?: string;
};

export async function getComplianceState(workspaceId: string) {
  const [workspace, activeLeads, softDeletedLeads, oldestLead] = await Promise.all([
    db.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: {
        id: true,
        name: true,
        leadRetentionDays: true,
        approvalPolicy: true,
        deletedAt: true,
      },
    }),
    db.lead.count({ where: { workspaceId, deletedAt: null } }),
    db.lead.count({ where: { workspaceId, deletedAt: { not: null } } }),
    db.lead.findFirst({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  if (!workspace) return null;

  return {
    ...workspace,
    activeLeads,
    softDeletedLeads,
    oldestLeadAt: oldestLead?.createdAt ?? null,
    graceDays: SOFT_DELETE_GRACE_DAYS,
  };
}

export async function updateComplianceSettings(
  input: ComplianceSettingsInput,
): Promise<{ ok: true } | ComplianceFailure> {
  const retentionDays = parseRetentionDays(input.retentionDays);
  if (retentionDays === undefined) {
    return { ok: false, code: "INVALID", message: "Choose a supported retention window." };
  }
  if (!isApprovalPolicy(input.approvalPolicy)) {
    return {
      ok: false,
      code: "INVALID",
      message: `Choose one of: ${APPROVAL_POLICIES.join(", ")}.`,
    };
  }

  const workspace = await db.workspace.findFirst({
    where: { id: input.workspaceId, deletedAt: null },
    select: { id: true, leadRetentionDays: true, approvalPolicy: true },
  });
  if (!workspace) {
    return { ok: false, code: "NOT_FOUND", message: "Workspace not found." };
  }

  const previous = {
    leadRetentionDays: workspace.leadRetentionDays,
    approvalPolicy: workspace.approvalPolicy,
  };
  const next = { leadRetentionDays: retentionDays, approvalPolicy: input.approvalPolicy };

  if (
    previous.leadRetentionDays === next.leadRetentionDays &&
    previous.approvalPolicy === next.approvalPolicy
  ) {
    return { ok: true };
  }

  await db.workspace.update({ where: { id: workspace.id }, data: next });
  await writeAuditLog({
    workspaceId: workspace.id,
    actorId: input.actorId,
    action: "workspace.compliance_updated",
    entityType: "Workspace",
    entityId: workspace.id,
    metadata: { previous, next },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { ok: true };
}

/**
 * Applies the workspace's retention window by soft-deleting stale leads, then
 * permanently removes leads and workspaces whose 30-day grace period is over.
 * A person can run this for their own workspace; the worker runs it across
 * workspaces on a schedule.
 */
export async function runRetentionCleanup(options: {
  workspaceId?: string;
  actorId?: string;
  ip?: string;
  userAgent?: string;
  now?: Date;
} = {}): Promise<{
  ok: true;
  leadsSoftDeleted: number;
  leadsPurged: number;
  workspacesPurged: number;
}> {
  const now = options.now ?? new Date();
  const graceCutoff = purgeCutoff(now);

  // Only workspaces with a retention window need the soft-delete pass. Purging
  // already-soft-deleted rows is a separate global sweep below, so a workspace
  // without a window never keeps stale rows alive.
  const workspaces = await db.workspace.findMany({
    where: {
      ...(options.workspaceId ? { id: options.workspaceId } : {}),
      deletedAt: null,
      leadRetentionDays: { not: null },
    },
    select: { id: true, leadRetentionDays: true },
  });

  let leadsSoftDeleted = 0;
  for (const workspace of workspaces) {
    const cutoff = retentionCutoff(workspace.leadRetentionDays, now);
    if (cutoff) {
      const result = await db.lead.updateMany({
        where: { workspaceId: workspace.id, deletedAt: null, updatedAt: { lt: cutoff } },
        data: { deletedAt: now },
      });
      leadsSoftDeleted += result.count;
    }
  }

  const purgedLeads = await db.lead.deleteMany({
    where: {
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      deletedAt: { lte: graceCutoff },
    },
  });

  const expiredWorkspaces = await db.workspace.findMany({
    where: {
      ...(options.workspaceId ? { id: options.workspaceId } : {}),
      deletedAt: { lte: graceCutoff },
    },
    select: { id: true, name: true },
    take: 25,
  });

  let workspacesPurged = 0;
  for (const workspace of expiredWorkspaces) {
    await writeAuditLog({
      workspaceId: workspace.id,
      actorId: options.actorId ?? null,
      action: "workspace.purged",
      entityType: "Workspace",
      entityId: workspace.id,
      metadata: { workspaceName: workspace.name, graceDays: SOFT_DELETE_GRACE_DAYS },
      ip: options.ip,
      userAgent: options.userAgent,
    });
    try {
      await db.workspace.delete({ where: { id: workspace.id } });
      workspacesPurged += 1;
    } catch (error) {
      console.error("Failed to purge workspace", { workspaceId: workspace.id, error });
    }
  }

  // A person-triggered run is always audited, even when nothing changed, so the
  // log proves the action happened. Scheduled runs only add an entry when they
  // actually touched rows, keeping the audit log from filling with no-ops.
  if (
    options.workspaceId &&
    (options.actorId || leadsSoftDeleted > 0 || purgedLeads.count > 0)
  ) {
    await writeAuditLog({
      workspaceId: options.workspaceId,
      actorId: options.actorId ?? null,
      action: "workspace.retention_run",
      entityType: "Workspace",
      entityId: options.workspaceId,
      metadata: {
        leadsSoftDeleted,
        leadsPurged: purgedLeads.count,
        retentionDays: workspaces[0]?.leadRetentionDays ?? null,
      },
      ip: options.ip,
      userAgent: options.userAgent,
    });
  }

  return {
    ok: true,
    leadsSoftDeleted,
    leadsPurged: purgedLeads.count,
    workspacesPurged,
  };
}

export async function exportWorkspaceData(input: {
  workspaceId: string;
  actorId: string;
  ip?: string;
  userAgent?: string;
}) {
  const workspace = await db.workspace.findFirst({
    where: { id: input.workspaceId, deletedAt: null },
    include: {
      profile: true,
      subscription: {
        select: {
          status: true,
          provider: true,
          interval: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          plan: { select: { key: true, name: true } },
        },
      },
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              emailVerifiedAt: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      leads: {
        where: { deletedAt: null },
        include: {
          verifications: true,
          activities: { orderBy: { createdAt: "desc" }, take: 500 },
        },
        orderBy: { createdAt: "asc" },
      },
      campaigns: {
        include: { leads: { select: { leadId: true, stage: true, addedAt: true } } },
        orderBy: { createdAt: "asc" },
      },
      outreachMessages: {
        select: {
          id: true,
          campaignId: true,
          leadId: true,
          subject: true,
          body: true,
          status: true,
          approvedAt: true,
          sentAt: true,
          repliedAt: true,
          meetingAt: true,
          bouncedAt: true,
          outcomeNote: true,
          providerMessageId: true,
          failureReason: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      suppressionEntries: { orderBy: { createdAt: "asc" } },
      leadImports: { orderBy: { createdAt: "asc" } },
      jobs: {
        include: { steps: true },
        orderBy: { createdAt: "asc" },
      },
      integrations: {
        select: {
          provider: true,
          status: true,
          accountLabel: true,
          lastCheckedAt: true,
          error: true,
        },
      },
      auditLogs: {
        include: { actor: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!workspace) return null;

  await writeAuditLog({
    workspaceId: workspace.id,
    actorId: input.actorId,
    action: "workspace.data_exported",
    entityType: "Workspace",
    entityId: workspace.id,
    metadata: { formatVersion: 1 },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: workspace.createdAt,
      onboardedAt: workspace.onboardedAt,
      leadRetentionDays: workspace.leadRetentionDays,
      approvalPolicy: workspace.approvalPolicy,
    },
    profile: workspace.profile,
    subscription: workspace.subscription,
    members: workspace.memberships.map((membership) => ({
      role: membership.role,
      joinedAt: membership.createdAt,
      user: membership.user,
    })),
    leads: workspace.leads,
    campaigns: workspace.campaigns,
    outreachMessages: workspace.outreachMessages,
    suppressionEntries: workspace.suppressionEntries,
    leadImports: workspace.leadImports,
    jobs: workspace.jobs,
    integrations: workspace.integrations,
    auditLogs: workspace.auditLogs,
  };
}

/**
 * Immediate soft delete: the workspace disappears from every member's account
 * and stops all provider-backed work. Data is purged after the grace period by
 * the retention worker. A live Razorpay subscription must be cancelled first.
 */
export async function requestWorkspaceDeletion(input: {
  workspaceId: string;
  actorId: string;
  confirmation: string;
  password: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ ok: true } | ComplianceFailure> {
  const workspace = await db.workspace.findFirst({
    where: { id: input.workspaceId, deletedAt: null },
    include: { subscription: { select: { status: true, providerSubscriptionId: true } } },
  });
  if (!workspace) {
    return { ok: false, code: "NOT_FOUND", message: "Workspace not found." };
  }
  if (input.confirmation.trim() !== workspace.name) {
    return {
      ok: false,
      code: "INVALID",
      message: "Type the workspace name exactly to confirm deletion.",
    };
  }

  const subscription = workspace.subscription;
  if (
    subscription?.providerSubscriptionId &&
    subscription.status !== "CANCELED"
  ) {
    return {
      ok: false,
      code: "CONFLICT",
      message:
        "Cancel the Razorpay subscription before deleting the workspace. Deleting it while billing is active would leave the customer paying for an inaccessible workspace.",
    };
  }

  const user = await db.user.findUnique({
    where: { id: input.actorId },
    select: { passwordHash: true },
  });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    return { ok: false, code: "INVALID", message: "Current password is incorrect." };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: workspace.id },
      data: { deletedAt: now },
    });
    await tx.invite.deleteMany({ where: { workspaceId: workspace.id } });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorId: input.actorId,
        action: "workspace.deletion_requested",
        entityType: "Workspace",
        entityId: workspace.id,
        metadata: JSON.stringify({
          workspaceName: workspace.name,
          purgeAfterDays: SOFT_DELETE_GRACE_DAYS,
        }),
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  });

  return { ok: true };
}
