"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { checkRateLimit } from "@/lib/auth/rate-limit";
import { RATE_LIMITS, rateLimitMessage } from "@/lib/auth/rate-limits";
import { createSession, getSession } from "@/lib/auth/session";
import { getAuthContext, roleAtLeast, setActiveWorkspace } from "@/lib/auth/workspace";
import { formString, toFieldErrors, type FormState } from "@/lib/form";
import { getClientIp, getUserAgent } from "@/lib/request";
import {
  acceptInviteRegistrationSchema,
  inviteMemberSchema,
} from "@/lib/validation/team";
import {
  acceptInvite,
  inviteMember,
  registerAndAcceptInvite,
  revokeInvite,
} from "@/server/services/team";

export async function inviteMemberAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Workspace not found. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "ADMIN")) {
    return { status: "error", message: "Only workspace admins and owners can invite teammates." };
  }

  const parsed = inviteMemberSchema.safeParse({
    email: formString(formData, "email"),
    role: formString(formData, "role"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  if (parsed.data.role === "ADMIN" && !roleAtLeast(context.role, "OWNER")) {
    return {
      status: "error",
      fieldErrors: { role: ["Only the workspace owner can invite another admin."] },
    };
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit(
    `team-invite:${context.workspace.id}`,
    RATE_LIMITS.teamInvite.limit,
    RATE_LIMITS.teamInvite.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const result = await inviteMember({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    email: parsed.data.email,
    role: parsed.data.role,
    ip,
    userAgent: await getUserAgent(),
  });

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
      fieldErrors: result.code === "CONFLICT" ? { email: [result.message] } : undefined,
    };
  }

  revalidatePath("/settings");

  if (!result.emailDelivery.ok) {
    return {
      status: "success",
      message: `Invitation created, but the email could not be sent (${result.emailDelivery.message}). Share this link with your teammate: ${result.inviteUrl}`,
    };
  }

  return {
    status: "success",
    message: `Invitation sent to ${parsed.data.email}. The link expires in 7 days.`,
  };
}

export async function revokeInviteAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Workspace not found. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "ADMIN")) {
    return { status: "error", message: "Only workspace admins and owners can revoke invitations." };
  }

  const inviteId = formString(formData, "inviteId");
  if (!inviteId) {
    return { status: "error", message: "That invitation no longer exists." };
  }

  const result = await revokeInvite({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    inviteId,
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  revalidatePath("/settings");
  return { status: "success", message: "Invitation revoked. The seat is available again." };
}

export async function acceptInviteAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = formString(formData, "token");
  const session = await getSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit(
    `invite-accept:${ip}`,
    RATE_LIMITS.inviteAccept.limit,
    RATE_LIMITS.inviteAccept.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const result = await acceptInvite({
    token,
    userId: session.user.id,
    ip,
    userAgent: await getUserAgent(),
  });
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  await setActiveWorkspace(result.workspaceId);
  redirect("/dashboard");
}

export async function acceptInviteRegistrationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = acceptInviteRegistrationSchema.safeParse({
    token: formString(formData, "token"),
    name: formString(formData, "name"),
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit(
    `invite-register:${ip}`,
    RATE_LIMITS.inviteRegister.limit,
    RATE_LIMITS.inviteRegister.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const result = await registerAndAcceptInvite({
    token: parsed.data.token,
    name: parsed.data.name,
    password: parsed.data.password,
    ip,
    userAgent: await getUserAgent(),
  });
  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
      fieldErrors: result.code === "CONFLICT" ? { email: [result.message] } : undefined,
    };
  }

  await createSession(result.userId, { ip, userAgent: await getUserAgent() });
  await setActiveWorkspace(result.workspaceId);
  redirect("/dashboard");
}
