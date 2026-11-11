import "server-only";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { normalizeEmail, randomToken } from "@/lib/security/hash";

export type AccountFailureCode = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID";

export type AccountFailure = {
  ok: false;
  code: AccountFailureCode;
  message: string;
};

export type DeleteAccountResult = {
  ok: true;
  membershipsRemoved: number;
  invitesRemoved: number;
  sessionsRevoked: number;
};

/** Carries a conflict out of the transaction so every write rolls back. */
class OwnedWorkspacesError extends Error {
  constructor(readonly count: number) {
    super("Account still owns workspaces");
    this.name = "OwnedWorkspacesError";
  }
}

export async function getAccountDeletionState(userId: string) {
  const [ownedActiveWorkspaces, membershipCount] = await Promise.all([
    db.workspace.count({ where: { ownerId: userId, deletedAt: null } }),
    db.membership.count({ where: { userId } }),
  ]);
  return { ownedActiveWorkspaces, membershipCount };
}

function deletionBlocked(count: number): AccountFailure {
  return {
    ok: false,
    code: "CONFLICT",
    message:
      count === 1
        ? "You own an active workspace. Transfer its ownership or delete it before closing your account."
        : `You own ${count} active workspaces. Transfer ownership or delete each one before closing your account.`,
  };
}

/**
 * Closes the signed-in account without destroying workspace records.
 *
 * The user row is anonymized rather than deleted: workspaces, leads, campaigns, and audit
 * entries keep their foreign keys and render as "Deleted user". Sessions, email tokens,
 * pending invitations for the address, and memberships are removed. Owners must transfer or
 * delete every active workspace first, and superadmins must be removed by another platform
 * administrator. The re-entered password and typed email prevent a hijacked session from
 * erasing the account silently.
 */
export async function deleteAccount(input: {
  userId: string;
  emailConfirmation: string;
  password: string;
  ip?: string;
  userAgent?: string;
}): Promise<DeleteAccountResult | AccountFailure> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      disabledAt: true,
      isSuperAdmin: true,
    },
  });
  if (!user || user.disabledAt) {
    return { ok: false, code: "NOT_FOUND", message: "This account is already closed." };
  }
  if (user.isSuperAdmin) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message:
        "Superadmin accounts cannot close themselves. Ask another platform administrator to remove this account.",
    };
  }
  if (normalizeEmail(input.emailConfirmation) !== user.email) {
    return {
      ok: false,
      code: "INVALID",
      message: "Type the account email exactly to confirm.",
    };
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    return { ok: false, code: "INVALID", message: "Current password is incorrect." };
  }

  const owned = await db.workspace.count({
    where: { ownerId: user.id, deletedAt: null },
  });
  if (owned > 0) return deletionBlocked(owned);

  // Replace the credential with a hash nobody knows, so even a leaked hash is useless.
  const replacementHash = await hashPassword(randomToken(32));
  const tombstoneEmail = `deleted+${user.id}@deleted.invalid`;

  try {
    return await db.$transaction(async (tx) => {
      // Re-check under a write lock; a concurrent ownership transfer must not land on a
      // disabled account with no membership.
      const current = await tx.user.update({
        where: { id: user.id },
        data: { updatedAt: new Date() },
        select: { id: true, email: true, disabledAt: true, isSuperAdmin: true },
      });
      if (current.disabledAt) {
        return {
          ok: false as const,
          code: "NOT_FOUND" as const,
          message: "This account is already closed.",
        };
      }
      if (current.isSuperAdmin) {
        return {
          ok: false as const,
          code: "FORBIDDEN" as const,
          message:
            "Superadmin accounts cannot close themselves. Ask another platform administrator to remove this account.",
        };
      }

      const sessions = await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.emailToken.deleteMany({ where: { userId: user.id } });
      const invites = await tx.invite.deleteMany({ where: { email: current.email } });
      const memberships = await tx.membership.deleteMany({ where: { userId: user.id } });

      const stillOwned = await tx.workspace.count({
        where: { ownerId: user.id, deletedAt: null },
      });
      if (stillOwned > 0) throw new OwnedWorkspacesError(stillOwned);

      await tx.user.update({
        where: { id: user.id },
        data: {
          email: tombstoneEmail,
          name: "Deleted user",
          passwordHash: replacementHash,
          emailVerifiedAt: null,
          lastLoginAt: null,
          disabledAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "account.deleted",
          entityType: "User",
          entityId: user.id,
          metadata: JSON.stringify({
            membershipsRemoved: memberships.count,
            invitesRemoved: invites.count,
            sessionsRevoked: sessions.count,
          }),
          ip: input.ip,
          userAgent: input.userAgent,
        },
      });

      return {
        ok: true as const,
        membershipsRemoved: memberships.count,
        invitesRemoved: invites.count,
        sessionsRevoked: sessions.count,
      };
    });
  } catch (error) {
    if (error instanceof OwnedWorkspacesError) return deletionBlocked(error.count);
    throw error;
  }
}
