"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { checkRateLimit } from "@/lib/auth/rate-limit";
import { RATE_LIMITS, rateLimitMessage } from "@/lib/auth/rate-limits";
import { destroyCurrentSession } from "@/lib/auth/session";
import { getAuthContext, roleAtLeast } from "@/lib/auth/workspace";
import { formString, type FormState } from "@/lib/form";
import { getClientIp, getUserAgent } from "@/lib/request";
import {
  requestWorkspaceDeletion,
  runRetentionCleanup,
  updateComplianceSettings,
} from "@/server/services/compliance";

export async function updateComplianceSettingsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "ADMIN")) {
    return { status: "error", message: "Only workspace admins can change compliance settings." };
  }

  const limit = await checkRateLimit(
    `compliance-update:${context.workspace.id}:${context.user.id}`,
    RATE_LIMITS.complianceUpdate.limit,
    RATE_LIMITS.complianceUpdate.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const result = await updateComplianceSettings({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    retentionDays: formString(formData, "retentionDays"),
    approvalPolicy: formString(formData, "approvalPolicy"),
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/settings");
  return {
    status: "success",
    message: "Compliance settings saved. The approval policy applies to new approvals and sends.",
  };
}

export async function runRetentionCleanupAction(
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  void _previous;
  void _formData;
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "ADMIN")) {
    return { status: "error", message: "Only workspace admins can run retention cleanup." };
  }

  const limit = await checkRateLimit(
    `retention-cleanup:${context.workspace.id}:${context.user.id}`,
    RATE_LIMITS.retentionCleanup.limit,
    RATE_LIMITS.retentionCleanup.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const result = await runRetentionCleanup({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });

  revalidatePath("/settings");
  revalidatePath("/leads");
  return {
    status: "success",
    message: `Retention cleanup finished: ${result.leadsSoftDeleted} lead(s) soft-deleted, ${result.leadsPurged} permanently purged.`,
  };
}

export async function requestWorkspaceDeletionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "OWNER")) {
    return { status: "error", message: "Only the workspace owner can delete the workspace." };
  }

  const limit = await checkRateLimit(
    `workspace-deletion:${context.workspace.id}:${context.user.id}`,
    RATE_LIMITS.workspaceDeletion.limit,
    RATE_LIMITS.workspaceDeletion.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const result = await requestWorkspaceDeletion({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    confirmation: formString(formData, "confirmation"),
    password: formString(formData, "password"),
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });
  if (!result.ok) return { status: "error", message: result.message };

  await destroyCurrentSession();
  redirect("/login?deleted=1");
}
