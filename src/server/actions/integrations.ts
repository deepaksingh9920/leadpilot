"use server";

import { revalidatePath } from "next/cache";

import { checkRateLimit } from "@/lib/auth/rate-limit";
import { RATE_LIMITS, rateLimitMessage } from "@/lib/auth/rate-limits";
import { canManageIntegrations } from "@/lib/auth/roles";
import { getAuthContext } from "@/lib/auth/workspace";
import { formString, toFieldErrors, type FormState } from "@/lib/form";
import { getClientIp, getUserAgent } from "@/lib/request";
import {
  aiCredentialsInputSchema,
  emailCredentialsInputSchema,
  leadSourceCredentialsInputSchema,
} from "@/lib/validation/integrations";
import {
  accountLabelFor,
  INTEGRATION_PROVIDERS,
  removeIntegration,
  saveIntegration,
  type IntegrationProvider,
} from "@/server/services/integrations";

function isProvider(value: string): value is IntegrationProvider {
  return (INTEGRATION_PROVIDERS as readonly string[]).includes(value);
}

function revalidateIntegrations(): void {
  revalidatePath("/integrations");
  revalidatePath("/agents");
  revalidatePath("/dashboard");
}

export async function saveIntegrationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Workspace not found. Sign in and try again." };
  }
  if (!canManageIntegrations(context.role)) {
    return {
      status: "error",
      message: "Only workspace owners and admins can change provider credentials.",
    };
  }

  const limit = await checkRateLimit(
    `integration-save:${context.workspace.id}:${context.user.id}`,
    RATE_LIMITS.integrationSave.limit,
    RATE_LIMITS.integrationSave.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const provider = formString(formData, "provider");
  if (!isProvider(provider)) {
    return { status: "error", message: "Choose a supported integration." };
  }

  if (provider === "AI") {
    const parsed = aiCredentialsInputSchema.safeParse({
      apiKey: formString(formData, "apiKey"),
      model: formString(formData, "model"),
      baseUrl: formString(formData, "baseUrl"),
    });
    if (!parsed.success) {
      return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
    }

    const result = await saveIntegration({
      workspaceId: context.workspace.id,
      provider,
      credentials: parsed.data,
      accountLabel: accountLabelFor(provider, parsed.data),
      actorId: context.user.id,
      ip: await getClientIp(),
      userAgent: await getUserAgent(),
    });
    if (!result.ok) return { status: "error", message: result.message };

    revalidateIntegrations();
    return {
      status: "success",
      message: "AI credentials saved encrypted. The key will not be shown again.",
    };
  }

  if (provider === "LEAD_SOURCE") {
    const parsed = leadSourceCredentialsInputSchema.safeParse({
      provider: formString(formData, "leadSource"),
      apiKey: formString(formData, "apiKey"),
      baseUrl: formString(formData, "baseUrl"),
    });
    if (!parsed.success) {
      return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
    }

    const result = await saveIntegration({
      workspaceId: context.workspace.id,
      provider,
      credentials: parsed.data,
      accountLabel: accountLabelFor(provider, parsed.data),
      actorId: context.user.id,
      ip: await getClientIp(),
      userAgent: await getUserAgent(),
    });
    if (!result.ok) return { status: "error", message: result.message };

    revalidateIntegrations();
    return {
      status: "success",
      message: "Lead-source credentials saved encrypted. The key will not be shown again.",
    };
  }

  const parsed = emailCredentialsInputSchema.safeParse({
    apiKey: formString(formData, "apiKey"),
    from: formString(formData, "from"),
    replyTo: formString(formData, "replyTo"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const result = await saveIntegration({
    workspaceId: context.workspace.id,
    provider,
    credentials: parsed.data,
    accountLabel: accountLabelFor(provider, parsed.data),
    actorId: context.user.id,
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidateIntegrations();
  return {
    status: "success",
    message:
      "Email credentials saved encrypted. The sender must be on a domain verified in that Resend account.",
  };
}

export async function removeIntegrationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Workspace not found. Sign in and try again." };
  }
  if (!canManageIntegrations(context.role)) {
    return {
      status: "error",
      message: "Only workspace owners and admins can change provider credentials.",
    };
  }

  const limit = await checkRateLimit(
    `integration-remove:${context.workspace.id}:${context.user.id}`,
    RATE_LIMITS.integrationRemove.limit,
    RATE_LIMITS.integrationRemove.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const provider = formString(formData, "provider");
  if (!isProvider(provider)) {
    return { status: "error", message: "Choose a supported integration." };
  }

  const result = await removeIntegration({
    workspaceId: context.workspace.id,
    provider,
    actorId: context.user.id,
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidateIntegrations();
  return {
    status: "success",
    message: "Stored credentials removed. Any deployment default applies again.",
  };
}
