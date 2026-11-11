import "server-only";

import type { Prisma } from "@prisma/client";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { canManageTeam, roleAtLeast, type WorkspaceRole } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { sendInviteEmail, type EmailResult } from "@/lib/email/send";
import { env } from "@/lib/env";
import { normalizeEmail, randomToken, sha256 } from "@/lib/security/hash";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ASSIGNABLE_ROLES = ["ADMIN", "MEMBER", "VIEWER"] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export type TeamFailure = {
  ok: false;
  code:
    | "NOT_FOUND"
    | "FORBIDDEN"
    | "INVALID"
    | "CONFLICT"
    | "LIMIT"
    | "EXPIRED"
    | "ACCEPTED";
  message: string;
};

type InviteRow = Prisma.InviteGetPayload<{
  include: {
    workspace: { select: { id: true; name: true } };
    invitedBy: { select: { name: true; email: true } };
  };
}>;

/**
 * Serializes seat checks for one workspace. Prisma transactions are not enough
 * on their own: two concurrent invite/accept requests could both count the same
 * members. A no-op write to the workspace row takes the database write lock
 * before the count, so the later transaction sees the committed row.
 */
async function lockWorkspace(tx: Prisma.TransactionClient, workspaceId: string): Promise<void> {
  await tx.$executeRaw`UPDATE "Workspace" SET "updatedAt" = "updatedAt" WHERE "id" = ${workspaceId}`;
}

async function seatLimitFor(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<number> {
  const subscription = await tx.subscription.findUnique({
    where: { workspaceId },
    include: { plan: { include: { limits: true } } },
  });
  return subscription?.plan.limits.find((limit) => limit.metric === "seats")?.limit ?? 1;
}

async function activeInviteCount(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  email?: string,
): Promise<number> {
  return tx.invite.count({
    where: {
      workspaceId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
      ...(email ? { email } : {}),
    },
  });
}

/** Members plus pending, unexpired invitations consume a seat. */
export async function getTeamState(workspaceId: string) {
  const now = new Date();
  const [memberships, invites, subscription] = await Promise.all([
    db.membership.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.invite.findMany({
      where: { workspaceId, acceptedAt: null, expiresAt: { gt: now } },
      include: { invitedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.subscription.findUnique({
      where: { workspaceId },
      include: { plan: { include: { limits: true } } },
    }),
  ]);

  const planLimits = subscription?.plan.limits ?? [];
  const seatLimit = planLimits.find((limit) => limit.metric === "seats")?.limit ?? 1;
  return { memberships, invites, seatLimit, seatsUsed: memberships.length + invites.length };
}

export async function inviteMember(input: {
  workspaceId: string;
  actorId: string;
  email: string;
  role: string;
  ip?: string;
  userAgent?: string;
}): Promise<
  { ok: true; inviteId: string; inviteUrl: string; emailDelivery: EmailResult } | TeamFailure
> {
  const email = normalizeEmail(input.email);
  const role = input.role.toUpperCase();
  if (!ASSIGNABLE_ROLES.includes(role as AssignableRole)) {
    return { ok: false, code: "INVALID", message: "Choose a valid role for the invitation." };
  }

  const actor = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorId } },
    include: {
      user: { select: { name: true } },
      workspace: { select: { id: true, name: true, deletedAt: true } },
    },
  });
  if (!actor || actor.workspace.deletedAt) {
    return { ok: false, code: "NOT_FOUND", message: "Workspace not found." };
  }
  if (!canManageTeam(actor.role)) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Only workspace admins and owners can invite teammates.",
    };
  }
  if (role === "ADMIN" && !roleAtLeast(actor.role, "OWNER")) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Only the workspace owner can invite another admin.",
    };
  }

  const existingMember = await db.membership.findFirst({
    where: { workspaceId: input.workspaceId, user: { email } },
    select: { id: true },
  });
  if (existingMember) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "That email already belongs to a member of this workspace.",
    };
  }

  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const result = await db.$transaction(async (tx) => {
    await lockWorkspace(tx, input.workspaceId);

    if ((await activeInviteCount(tx, input.workspaceId, email)) > 0) {
      return {
        ok: false as const,
        code: "CONFLICT" as const,
        message: "An active invitation for that email already exists.",
      };
    }

    const seatLimit = await seatLimitFor(tx, input.workspaceId);
    const memberCount = await tx.membership.count({
      where: { workspaceId: input.workspaceId },
    });
    const pendingCount = await activeInviteCount(tx, input.workspaceId);
    if (memberCount + pendingCount + 1 > seatLimit) {
      return {
        ok: false as const,
        code: "LIMIT" as const,
        message: `All ${seatLimit} seat${seatLimit === 1 ? " is" : "s are"} in use. Upgrade the plan or revoke a pending invitation first.`,
      };
    }

    const invite = await tx.invite.create({
      data: {
        workspaceId: input.workspaceId,
        email,
        role,
        tokenHash,
        invitedById: input.actorId,
        expiresAt,
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "team.invite_sent",
        entityType: "Invite",
        entityId: invite.id,
        metadata: JSON.stringify({ email, role, expiresAt: expiresAt.toISOString() }),
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });

    return { ok: true as const, inviteId: invite.id };
  });

  if (!result.ok) return result;

  const emailDelivery = await sendInviteEmail(
    email,
    actor.workspace.name,
    actor.user.name,
    role,
    token,
  );

  return {
    ok: true,
    inviteId: result.inviteId,
    inviteUrl: `${env.appUrl}/invite/${token}`,
    emailDelivery,
  };
}

export async function revokeInvite(input: {
  workspaceId: string;
  actorId: string;
  inviteId: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ ok: true } | TeamFailure> {
  const actor = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorId } },
    select: { role: true },
  });
  if (!actor) return { ok: false, code: "NOT_FOUND", message: "Workspace not found." };
  if (!canManageTeam(actor.role)) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Only workspace admins and owners can revoke invitations.",
    };
  }

  const invite = await db.invite.findFirst({
    where: { id: input.inviteId, workspaceId: input.workspaceId, acceptedAt: null },
  });
  if (!invite) {
    return { ok: false, code: "NOT_FOUND", message: "That invitation no longer exists." };
  }

  await db.$transaction(async (tx) => {
    await tx.invite.delete({ where: { id: invite.id } });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "team.invite_revoked",
        entityType: "Invite",
        entityId: invite.id,
        metadata: JSON.stringify({ email: invite.email, role: invite.role }),
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  });

  return { ok: true };
}

/**
 * Hands workspace ownership to another member. The current owner re-enters their
 * password, the target must already be a member with a non-viewer role, and both
 * memberships are rewritten in the same transaction that moves ownerId. Billing
 * stays attached to the workspace, so the new owner becomes responsible for it.
 */
export async function transferWorkspaceOwnership(input: {
  workspaceId: string;
  actorId: string;
  targetUserId: string;
  password: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ ok: true; newOwnerName: string } | TeamFailure> {
  const actor = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorId } },
    include: {
      user: { select: { name: true, email: true, passwordHash: true } },
      workspace: { select: { id: true, name: true, ownerId: true, deletedAt: true } },
    },
  });
  if (!actor || actor.workspace.deletedAt) {
    return { ok: false, code: "NOT_FOUND", message: "Workspace not found." };
  }
  if (!roleAtLeast(actor.role, "OWNER")) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Only the workspace owner can transfer ownership.",
    };
  }
  if (input.targetUserId === input.actorId) {
    return { ok: false, code: "INVALID", message: "You already own this workspace." };
  }

  const target = await db.membership.findUnique({
    where: {
      workspaceId_userId: { workspaceId: input.workspaceId, userId: input.targetUserId },
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!target) {
    return {
      ok: false,
      code: "INVALID",
      message: "Choose a current member of this workspace.",
    };
  }
  if (target.role === "VIEWER") {
    return {
      ok: false,
      code: "INVALID",
      message: "A viewer cannot become the owner. Change their role to member or admin first.",
    };
  }

  if (!(await verifyPassword(input.password, actor.user.passwordHash))) {
    return { ok: false, code: "INVALID", message: "Current password is incorrect." };
  }

  return db.$transaction(async (tx) => {
    await lockWorkspace(tx, input.workspaceId);

    const workspace = await tx.workspace.findFirst({
      where: { id: input.workspaceId, deletedAt: null },
      select: { id: true, name: true, ownerId: true },
    });
    if (!workspace) {
      return { ok: false as const, code: "NOT_FOUND" as const, message: "Workspace not found." };
    }

    const currentActor = await tx.membership.findUnique({
      where: {
        workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorId },
      },
      select: { role: true },
    });
    if (workspace.ownerId !== input.actorId || currentActor?.role !== "OWNER") {
      return {
        ok: false as const,
        code: "CONFLICT" as const,
        message: "Ownership changed while you were confirming. Reload and try again.",
      };
    }

    const currentTarget = await tx.membership.findUnique({
      where: {
        workspaceId_userId: { workspaceId: input.workspaceId, userId: input.targetUserId },
      },
      select: { role: true },
    });
    if (!currentTarget || currentTarget.role === "VIEWER") {
      return {
        ok: false as const,
        code: "CONFLICT" as const,
        message: "That member is no longer eligible to become the owner. Reload and try again.",
      };
    }

    await tx.workspace.update({
      where: { id: workspace.id },
      data: { ownerId: input.targetUserId },
    });
    await tx.membership.update({
      where: {
        workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorId },
      },
      data: { role: "ADMIN" },
    });
    await tx.membership.update({
      where: {
        workspaceId_userId: { workspaceId: input.workspaceId, userId: input.targetUserId },
      },
      data: { role: "OWNER" },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "workspace.ownership_transferred",
        entityType: "Workspace",
        entityId: input.workspaceId,
        metadata: JSON.stringify({
          workspaceName: workspace.name,
          previousOwner: { id: input.actorId, email: actor.user.email },
          nextOwner: { id: target.user.id, email: target.user.email },
        }),
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });

    return { ok: true as const, newOwnerName: target.user.name };
  });
}

export type InvitePreview =
  | {
      ok: true;
      email: string;
      workspaceName: string;
      role: string;
      inviterName: string;
      expiresAt: Date;
      hasAccount: boolean;
    }
  | { ok: false; code: "NOT_FOUND" | "EXPIRED" | "ACCEPTED"; message: string };

function inviteStatus(invite: InviteRow): InvitePreview {
  if (invite.acceptedAt) {
    return {
      ok: false,
      code: "ACCEPTED",
      message: "This invitation has already been accepted.",
    };
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return {
      ok: false,
      code: "EXPIRED",
      message: "This invitation has expired. Ask a workspace admin to send a new one.",
    };
  }
  return {
    ok: true,
    email: invite.email,
    workspaceName: invite.workspace.name,
    role: invite.role,
    inviterName: invite.invitedBy?.name ?? "A workspace admin",
    expiresAt: invite.expiresAt,
    hasAccount: false,
  };
}

export async function getInvitePreview(token: string): Promise<InvitePreview> {
  if (!token || token.length < 20) {
    return { ok: false, code: "NOT_FOUND", message: "This invitation link is invalid." };
  }

  const invite = await db.invite.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      workspace: { select: { id: true, name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
  if (!invite) {
    return { ok: false, code: "NOT_FOUND", message: "This invitation link is invalid." };
  }

  const status = inviteStatus(invite);
  if (!status.ok) return status;

  const existing = await db.user.findUnique({
    where: { email: invite.email },
    select: { id: true },
  });
  return { ...status, hasAccount: Boolean(existing) };
}

async function acceptInTransaction(
  tx: Prisma.TransactionClient,
  invite: Prisma.InviteGetPayload<Record<string, never>>,
  userId: string,
  actorId: string,
  ip?: string,
  userAgent?: string,
): Promise<{ ok: true; workspaceId: string } | TeamFailure> {
  await lockWorkspace(tx, invite.workspaceId);

  const current = await tx.invite.findUnique({ where: { id: invite.id } });
  if (!current || current.acceptedAt) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "This invitation has already been used.",
    };
  }
  if (current.expiresAt.getTime() <= Date.now()) {
    return {
      ok: false,
      code: "EXPIRED",
      message: "This invitation has expired. Ask a workspace admin to send a new one.",
    };
  }

  const existingMembership = await tx.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: current.workspaceId, userId } },
  });
  if (!existingMembership) {
    const seatLimit = await seatLimitFor(tx, current.workspaceId);
    const memberCount = await tx.membership.count({
      where: { workspaceId: current.workspaceId },
    });
    if (memberCount + 1 > seatLimit) {
      return {
        ok: false,
        code: "LIMIT",
        message: `All ${seatLimit} seat${seatLimit === 1 ? " is" : "s are"} in use. Ask a workspace admin to upgrade the plan.`,
      };
    }

    await tx.membership.create({
      data: {
        workspaceId: current.workspaceId,
        userId,
        role: current.role,
      },
    });
  }

  await tx.invite.update({
    where: { id: current.id },
    data: { acceptedAt: new Date() },
  });

  await tx.auditLog.create({
    data: {
      workspaceId: current.workspaceId,
      actorId,
      action: "team.invite_accepted",
      entityType: "Invite",
      entityId: current.id,
      metadata: JSON.stringify({ email: current.email, role: current.role }),
      ip,
      userAgent,
    },
  });

  return { ok: true, workspaceId: current.workspaceId };
}

export async function acceptInvite(input: {
  token: string;
  userId: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ ok: true; workspaceId: string } | TeamFailure> {
  const invite = await db.invite.findUnique({
    where: { tokenHash: sha256(input.token) },
    include: {
      workspace: { select: { id: true, name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
  if (!invite) {
    return { ok: false, code: "NOT_FOUND", message: "This invitation link is invalid." };
  }
  const status = inviteStatus(invite);
  if (!status.ok) return status;

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, emailVerifiedAt: true },
  });
  if (!user) return { ok: false, code: "NOT_FOUND", message: "Sign in to accept this invitation." };
  if (normalizeEmail(user.email) !== invite.email) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: `This invitation was sent to ${invite.email}. Sign in with that address to accept it.`,
    };
  }

  const result = await db.$transaction((tx) =>
    acceptInTransaction(tx, invite, user.id, user.id, input.ip, input.userAgent),
  );

  if (result.ok && !user.emailVerifiedAt) {
    await db.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
  }

  return result;
}

/** New teammates prove ownership of the invited address by holding the token. */
export async function registerAndAcceptInvite(input: {
  token: string;
  name: string;
  password: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ ok: true; userId: string; workspaceId: string } | TeamFailure> {
  const invite = await db.invite.findUnique({
    where: { tokenHash: sha256(input.token) },
    include: {
      workspace: { select: { id: true, name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
  if (!invite) {
    return { ok: false, code: "NOT_FOUND", message: "This invitation link is invalid." };
  }
  const status = inviteStatus(invite);
  if (!status.ok) return status;

  const passwordHash = await hashPassword(input.password);

  return db.$transaction(async (tx) => {
    await lockWorkspace(tx, invite.workspaceId);

    const current = await tx.invite.findUnique({ where: { id: invite.id } });
    if (!current || current.acceptedAt) {
      return {
        ok: false as const,
        code: "CONFLICT" as const,
        message: "This invitation has already been used.",
      };
    }
    if (current.expiresAt.getTime() <= Date.now()) {
      return {
        ok: false as const,
        code: "EXPIRED" as const,
        message: "This invitation has expired. Ask a workspace admin to send a new one.",
      };
    }

    const existing = await tx.user.findUnique({
      where: { email: current.email },
      select: { id: true },
    });
    if (existing) {
      return {
        ok: false as const,
        code: "CONFLICT" as const,
        message: "An account already exists for this email. Sign in to accept the invitation.",
      };
    }

    const seatLimit = await seatLimitFor(tx, current.workspaceId);
    const memberCount = await tx.membership.count({
      where: { workspaceId: current.workspaceId },
    });
    if (memberCount + 1 > seatLimit) {
      return {
        ok: false as const,
        code: "LIMIT" as const,
        message: `All ${seatLimit} seat${seatLimit === 1 ? " is" : "s are"} in use. Ask a workspace admin to upgrade the plan.`,
      };
    }

    const user = await tx.user.create({
      data: {
        email: current.email,
        name: input.name,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
    });

    await tx.membership.create({
      data: {
        workspaceId: current.workspaceId,
        userId: user.id,
        role: current.role,
      },
    });

    await tx.invite.update({
      where: { id: current.id },
      data: { acceptedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: current.workspaceId,
        actorId: user.id,
        action: "team.invite_accepted",
        entityType: "Invite",
        entityId: current.id,
        metadata: JSON.stringify({ email: current.email, role: current.role, newAccount: true }),
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });

    return { ok: true as const, userId: user.id, workspaceId: current.workspaceId };
  });
}

export type { WorkspaceRole };
