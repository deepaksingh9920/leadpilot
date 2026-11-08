"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canManageBilling, getAuthContext } from "@/lib/auth/workspace";
import { formString, type FormState } from "@/lib/form";
import {
  cancelWorkspaceSubscription,
  startSubscriptionCheckout,
} from "@/server/services/billing";

export async function startCheckoutAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!canManageBilling(context.role)) {
    return { status: "error", message: "Only the workspace owner can change billing." };
  }

  const planId = formString(formData, "planId");
  const interval = formString(formData, "interval");
  if (!planId || !interval) {
    return { status: "error", message: "Choose a plan and billing interval." };
  }

  const result = await startSubscriptionCheckout({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    planId,
    interval,
  });
  if (!result.ok) return { status: "error", message: result.message };

  redirect(result.shortUrl);
}

export async function cancelSubscriptionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!canManageBilling(context.role)) {
    return { status: "error", message: "Only the workspace owner can change billing." };
  }

  const result = await cancelWorkspaceSubscription({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    atCycleEnd: formString(formData, "atCycleEnd") !== "now",
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return {
    status: "success",
    message:
      formString(formData, "atCycleEnd") !== "now"
        ? "Subscription set to cancel at the end of the current period."
        : "Subscription canceled immediately.",
  };
}
