"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { changePassword } from "@/server/services/auth";
import { deleteAccount } from "@/server/services/account";
import { updateBusinessProfile } from "@/server/services/onboarding";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { RATE_LIMITS, rateLimitMessage } from "@/lib/auth/rate-limits";
import { getAuthContext, roleAtLeast, setActiveWorkspace } from "@/lib/auth/workspace";
import { destroyCurrentSession, getSession } from "@/lib/auth/session";
import { formString, toFieldErrors, type FormState } from "@/lib/form";
import { getClientIp, getUserAgent } from "@/lib/request";
import { changePasswordSchema, deleteAccountSchema } from "@/lib/validation/auth";
import { profileSettingsSchema } from "@/lib/validation/onboarding";
import { db } from "@/lib/db";

export async function updateProfileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Workspace not found. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "ADMIN")) {
    return { status: "error", message: "You do not have permission to edit this profile." };
  }

  const limit = await checkRateLimit(
    `profile-update:${context.user.id}`,
    RATE_LIMITS.profileUpdate.limit,
    RATE_LIMITS.profileUpdate.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const parsed = profileSettingsSchema.safeParse({
    name: formString(formData, "name"),
    workspaceName: formString(formData, "workspaceName"),
    companyName: formString(formData, "companyName"),
    website: formString(formData, "website"),
    industry: formString(formData, "industry"),
    companySize: formString(formData, "companySize"),
    regions: formString(formData, "regions"),
    targetCustomerTypes: formString(formData, "targetCustomerTypes"),
    budgetMin: formString(formData, "budgetMin"),
    budgetMax: formString(formData, "budgetMax"),
    description: formString(formData, "description"),
    valueProposition: formString(formData, "valueProposition"),
    phone: formString(formData, "phone"),
    mailingAddress: formString(formData, "mailingAddress"),
    senderName: formString(formData, "senderName"),
    senderEmail: formString(formData, "senderEmail"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const result = await updateBusinessProfile(
    context.user.id,
    context.workspace.id,
    parsed.data,
  );
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { status: "success", message: "Profile and workspace settings saved." };
}

export async function changePasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Sign in to continue." };

  const limit = await checkRateLimit(
    `password-change:${session.user.id}`,
    RATE_LIMITS.passwordChange.limit,
    RATE_LIMITS.passwordChange.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formString(formData, "currentPassword"),
    newPassword: formString(formData, "newPassword"),
    confirmPassword: formString(formData, "confirmPassword"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const result = await changePassword(
    session.user.id,
    session.id,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );

  if (!result.ok) return { status: "error", message: result.message };

  return {
    status: "success",
    message: "Password updated. Other sessions have been signed out.",
  };
}

export async function deleteAccountAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Sign in to continue." };

  const limit = await checkRateLimit(
    `account-deletion:${session.user.id}`,
    RATE_LIMITS.accountDeletion.limit,
    RATE_LIMITS.accountDeletion.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const parsed = deleteAccountSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
    confirm: formString(formData, "confirm"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const result = await deleteAccount({
    userId: session.user.id,
    emailConfirmation: parsed.data.email,
    password: parsed.data.password,
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });
  if (!result.ok) {
    const passwordIssue = result.message.toLowerCase().includes("password");
    return {
      status: "error",
      message: result.message,
      fieldErrors:
        result.code === "INVALID"
          ? passwordIssue
            ? { password: [result.message] }
            : { email: [result.message] }
          : undefined,
    };
  }

  await destroyCurrentSession();
  redirect("/login?account=deleted");
}

export async function switchWorkspaceAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const workspaceId = formString(formData, "workspaceId");
  const membership = await db.membership.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId: session.user.id },
    },
  });

  if (!membership) redirect("/dashboard");

  await setActiveWorkspace(workspaceId);
  redirect("/dashboard");
}
