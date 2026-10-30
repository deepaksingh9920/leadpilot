import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  type EmailResult,
} from "@/lib/email/send";
import { env } from "@/lib/env";
import { normalizeEmail, randomToken, sha256 } from "@/lib/security/hash";
import { writeAuditLog } from "@/lib/auth/audit";
import { createWorkspaceWithDefaults } from "@/server/services/workspaces";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export type SignUpInput = {
  name: string;
  email: string;
  companyName: string;
  password: string;
};

export type SignUpResult =
  | {
      ok: true;
      userId: string;
      workspaceId: string;
      emailDelivery: EmailResult | null;
    }
  | { ok: false; code: "EMAIL_TAKEN" | "CONFIG" | "UNKNOWN"; message: string };

export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const verificationToken = randomToken(32);
  const verificationTokenHash = sha256(verificationToken);

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) return { taken: true as const };

      const user = await tx.user.create({
        data: {
          name: input.name.trim(),
          email,
          passwordHash,
        },
      });

      const { workspaceId } = await createWorkspaceWithDefaults(tx, {
        ownerId: user.id,
        name: input.companyName.trim(),
      });

      await tx.emailToken.create({
        data: {
          userId: user.id,
          type: "VERIFY_EMAIL",
          tokenHash: verificationTokenHash,
          expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: user.id,
          action: "auth.signup",
          entityType: "User",
          entityId: user.id,
          metadata: JSON.stringify({ emailVerified: false }),
        },
      });

      return { taken: false as const, userId: user.id, workspaceId };
    });

    if (result.taken) {
      return {
        ok: false,
        code: "EMAIL_TAKEN",
        message: "An account with this email already exists. Try signing in instead.",
      };
    }

    let emailDelivery: EmailResult | null = null;
    if (env.emailConfigured) {
      emailDelivery = await sendVerificationEmail(
        email,
        input.name.trim(),
        verificationToken,
      );
    }

    return {
      ok: true,
      userId: result.userId,
      workspaceId: result.workspaceId,
      emailDelivery,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(",")
        : String(error.meta?.target ?? "");
      // Only a clash on the user email means the account exists. Any other unique
      // constraint is a server-side fault and must not be reported as "email taken".
      if (target.includes("email")) {
        return {
          ok: false,
          code: "EMAIL_TAKEN",
          message: "An account with this email already exists. Try signing in instead.",
        };
      }
      console.error("Signup failed on an unexpected unique constraint", error);
      return {
        ok: false,
        code: "UNKNOWN",
        message: "We could not create your account. Please try again.",
      };
    }
    console.error("Signup failed", error);
    return {
      ok: false,
      code: "UNKNOWN",
      message: "We could not create your account. Please try again.",
    };
  }
}

export type SignInResult =
  | { ok: true; userId: string; name: string; isSuperAdmin: boolean }
  | { ok: false; message: string };

export async function signIn(
  emailInput: string,
  password: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<SignInResult> {
  const email = normalizeEmail(emailInput);
  const user = await db.user.findUnique({ where: { email } });

  if (!user || user.disabledAt) {
    return { ok: false, message: "Email or password is incorrect." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { ok: false, message: "Email or password is incorrect." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await writeAuditLog({
    actorId: user.id,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return {
    ok: true,
    userId: user.id,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
  };
}

export async function issueVerificationEmail(userId: string): Promise<EmailResult> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.disabledAt) {
    return {
      ok: false,
      reason: "provider_error",
      message: "We could not find that account.",
    };
  }
  if (user.emailVerifiedAt) {
    return {
      ok: false,
      reason: "provider_error",
      message: "This email is already verified.",
    };
  }

  const token = randomToken(32);
  await db.$transaction([
    db.emailToken.deleteMany({
      where: { userId: user.id, type: "VERIFY_EMAIL", usedAt: null },
    }),
    db.emailToken.create({
      data: {
        userId: user.id,
        type: "VERIFY_EMAIL",
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
    }),
  ]);

  return sendVerificationEmail(user.email, user.name, token);
}

export async function requestPasswordReset(emailInput: string): Promise<void> {
  const email = normalizeEmail(emailInput);
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.disabledAt) return;

  const token = randomToken(32);
  await db.$transaction([
    db.emailToken.deleteMany({
      where: { userId: user.id, type: "RESET_PASSWORD", usedAt: null },
    }),
    db.emailToken.create({
      data: {
        userId: user.id,
        type: "RESET_PASSWORD",
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    }),
  ]);

  await writeAuditLog({
    actorId: user.id,
    action: "auth.password_reset_requested",
    entityType: "User",
    entityId: user.id,
  });

  if (env.emailConfigured) {
    await sendPasswordResetEmail(user.email, user.name, token);
  }
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const record = await db.emailToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (
    !record ||
    record.type !== "RESET_PASSWORD" ||
    record.usedAt ||
    record.expiresAt.getTime() <= Date.now() ||
    record.user.disabledAt
  ) {
    return { ok: false, message: "This reset link is invalid or has expired." };
  }

  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  await writeAuditLog({
    actorId: record.userId,
    action: "auth.password_reset_completed",
    entityType: "User",
    entityId: record.userId,
  });

  return { ok: true };
}

export async function verifyEmail(
  token: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const record = await db.emailToken.findUnique({
    where: { tokenHash: sha256(token) },
  });

  if (
    !record ||
    record.type !== "VERIFY_EMAIL" ||
    record.usedAt ||
    record.expiresAt.getTime() <= Date.now()
  ) {
    return { ok: false, message: "This verification link is invalid or has expired." };
  }

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    }),
    db.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  await writeAuditLog({
    actorId: record.userId,
    action: "auth.email_verified",
    entityType: "User",
    entityId: record.userId,
  });

  return { ok: true };
}

export async function changePassword(
  userId: string,
  sessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, message: "Account not found." };

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return { ok: false, message: "Your current password is incorrect." };

  const sameAsOld = await verifyPassword(newPassword, user.passwordHash);
  if (sameAsOld) {
    return { ok: false, message: "Choose a password you have not used here before." };
  }

  const passwordHash = await hashPassword(newPassword);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });
  await db.session.deleteMany({ where: { userId, id: { not: sessionId } } });

  await writeAuditLog({
    actorId: userId,
    action: "auth.password_changed",
    entityType: "User",
    entityId: userId,
  });

  return { ok: true };
}
