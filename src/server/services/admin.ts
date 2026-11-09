import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  FEATURE_FLAGS,
  featureSettingKey,
  getFeatureFlags,
  type FeatureFlagKey,
  type FeatureFlags,
} from "@/lib/features";

const ADMIN_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type AdminFailure = {
  ok: false;
  code: "INVALID" | "NOT_FOUND" | "CONFLICT";
  message: string;
};

function clampPage(value: number | undefined): number {
  return value && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function pageSize(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return ADMIN_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(value)));
}

function searchTerm(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

export type AdminWorkspaceRow = Prisma.WorkspaceGetPayload<{
  include: {
    owner: { select: { name: true; email: true } };
    subscription: { include: { plan: { select: { id: true; name: true; key: true } } } };
    _count: { select: { memberships: true; leads: true } };
  };
}>;

export async function getAdminWorkspacesPage(input: {
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  workspaces: AdminWorkspaceRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}> {
  const page = clampPage(input.page);
  const size = pageSize(input.pageSize);
  const q = searchTerm(input.q);

  const where: Prisma.WorkspaceWhereInput = { deletedAt: null };
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { slug: { contains: q } },
      { owner: { name: { contains: q } } },
      { owner: { email: { contains: q } } },
    ];
  }

  const [total, workspaces] = await Promise.all([
    db.workspace.count({ where }),
    db.workspace.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
      include: {
        owner: { select: { name: true, email: true } },
        subscription: {
          include: { plan: { select: { id: true, name: true, key: true } } },
        },
        _count: { select: { memberships: true, leads: true } },
      },
    }),
  ]);

  return {
    workspaces,
    total,
    page,
    pageSize: size,
    pageCount: Math.max(1, Math.ceil(total / size)),
  };
}

export const PROVIDER_MANAGED_STATUSES = [
  "ACTIVE",
  "TRIALING",
  "PENDING",
  "PAST_DUE",
  "PAUSED",
] as const;

/**
 * Manual plan assignment is a support tool, not a billing shortcut. A workspace
 * with a live provider subscription must cancel through Razorpay first, because
 * a later webhook would overwrite this change and the customer would be billed
 * for a plan the app no longer shows.
 */
export async function assignWorkspacePlan(input: {
  workspaceId: string;
  planId: string;
  actorId: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ ok: true; changed: boolean } | AdminFailure> {
  const [workspace, plan] = await Promise.all([
    db.workspace.findFirst({
      where: { id: input.workspaceId, deletedAt: null },
      include: { subscription: { include: { plan: true } } },
    }),
    db.plan.findUnique({ where: { id: input.planId } }),
  ]);

  if (!workspace) {
    return { ok: false, code: "NOT_FOUND", message: "Workspace not found." };
  }
  if (!plan || !plan.isActive) {
    return { ok: false, code: "INVALID", message: "Choose an active plan." };
  }

  const subscription = workspace.subscription;
  if (
    subscription?.providerSubscriptionId &&
    PROVIDER_MANAGED_STATUSES.includes(
      subscription.status as (typeof PROVIDER_MANAGED_STATUSES)[number],
    )
  ) {
    return {
      ok: false,
      code: "CONFLICT",
      message:
        "This workspace is managed by Razorpay. Cancel the provider subscription before assigning a plan manually.",
    };
  }

  const previousPlanId = subscription?.planId ?? null;
  if (previousPlanId === plan.id && subscription?.provider === "internal") {
    return { ok: true, changed: false };
  }

  await db.$transaction(async (tx) => {
    if (subscription) {
      await tx.subscription.update({
        where: { workspaceId: workspace.id },
        data: {
          planId: plan.id,
          status: "ACTIVE",
          provider: "internal",
          providerSubscriptionId: null,
          providerCustomerId: null,
          interval: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
      });
    } else {
      await tx.subscription.create({
        data: {
          workspaceId: workspace.id,
          planId: plan.id,
          status: "ACTIVE",
          provider: "internal",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorId: input.actorId,
        action: "workspace.plan_assigned",
        entityType: "Workspace",
        entityId: workspace.id,
        metadata: JSON.stringify({
          previous: previousPlanId
            ? { planId: previousPlanId, name: subscription?.plan.name ?? null }
            : null,
          next: { planId: plan.id, name: plan.name },
        }),
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  });

  return { ok: true, changed: true };
}

export type AuditSearchInput = {
  q?: string;
  workspaceId?: string;
  action?: string;
  from?: Date | null;
  to?: Date | null;
  page?: number;
  pageSize?: number;
};

export type AuditSearchRow = Prisma.AuditLogGetPayload<{
  include: {
    actor: { select: { name: true; email: true } };
    workspace: { select: { name: true } };
  };
}>;

export async function searchAuditLogs(input: AuditSearchInput): Promise<{
  entries: AuditSearchRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}> {
  const page = clampPage(input.page);
  const size = pageSize(input.pageSize);
  const q = searchTerm(input.q);
  const action = searchTerm(input.action);

  const where: Prisma.AuditLogWhereInput = {};
  if (input.workspaceId) where.workspaceId = input.workspaceId;
  if (action) where.action = { contains: action };
  if (input.from || input.to) {
    where.createdAt = {};
    if (input.from) where.createdAt.gte = input.from;
    if (input.to) where.createdAt.lte = input.to;
  }
  if (q) {
    where.OR = [
      { action: { contains: q } },
      { entityId: { contains: q } },
      { metadata: { contains: q } },
      { actor: { name: { contains: q } } },
      { actor: { email: { contains: q } } },
      { workspace: { name: { contains: q } } },
    ];
  }

  const [total, entries] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
      include: {
        actor: { select: { name: true, email: true } },
        workspace: { select: { name: true } },
      },
    }),
  ]);

  return {
    entries,
    total,
    page,
    pageSize: size,
    pageCount: Math.max(1, Math.ceil(total / size)),
  };
}

export async function getAuditWorkspaceOptions(): Promise<{ id: string; name: string }[]> {
  return db.workspace.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 200,
  });
}

export async function updateFeatureFlags(input: {
  flags: Partial<Record<FeatureFlagKey, boolean>>;
  actorId: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ ok: true; changed: FeatureFlagKey[] } | AdminFailure> {
  const known = new Set(FEATURE_FLAGS.map((flag) => flag.key));
  const submitted = Object.entries(input.flags).filter(
    (entry): entry is [FeatureFlagKey, boolean] =>
      typeof entry[1] === "boolean" && known.has(entry[0] as FeatureFlagKey),
  );

  if (submitted.length === 0) {
    return { ok: false, code: "INVALID", message: "Choose at least one feature setting." };
  }

  const previous = await getFeatureFlags();
  const changed = submitted.filter(([key, value]) => previous[key] !== value);
  if (changed.length === 0) return { ok: true, changed: [] };

  await db.$transaction(async (tx) => {
    for (const [key, value] of changed) {
      const settingKey = featureSettingKey(key);
      await tx.setting.upsert({
        where: { key: settingKey },
        update: { value: value ? "true" : "false" },
        create: { key: settingKey, value: value ? "true" : "false" },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "platform.feature_flags_updated",
        entityType: "Setting",
        metadata: JSON.stringify({
          previous: Object.fromEntries(changed.map(([key]) => [key, previous[key]])),
          next: Object.fromEntries(changed),
        }),
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  });

  return { ok: true, changed: changed.map(([key]) => key) };
}

export type { FeatureFlags };
