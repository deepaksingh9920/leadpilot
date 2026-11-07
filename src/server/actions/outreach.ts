"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  canApproveOutreach,
  getAuthContext,
  roleAtLeast,
} from "@/lib/auth/workspace";
import { formString, type FormState } from "@/lib/form";
import {
  approveOutreachMessage,
  cancelOutreachMessage,
  createOutreachDraft,
  recordOutreachOutcome,
  sendOutreachMessage,
  updateOutreachDraft,
} from "@/server/services/outreach";

function revalidateMessage(messageId: string, campaignId: string) {
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/messages/${messageId}`);
  revalidatePath("/campaigns");
  revalidatePath("/leads");
}

export async function createOutreachDraftAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "MEMBER")) {
    return { status: "error", message: "You do not have permission to draft outreach." };
  }

  const campaignId = formString(formData, "campaignId");
  const leadId = formString(formData, "leadId");
  if (!campaignId || !leadId) {
    return { status: "error", message: "Choose a lead to draft outreach for." };
  }

  const result = await createOutreachDraft({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    campaignId,
    leadId,
    subject: formString(formData, "subject"),
    body: formString(formData, "body"),
  });

  if (!result.ok) return { status: "error", message: result.message };

  revalidateMessage(result.messageId, campaignId);
  redirect(`/campaigns/${campaignId}/messages/${result.messageId}`);
}

export async function updateOutreachDraftAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "MEMBER")) {
    return { status: "error", message: "You do not have permission to edit outreach." };
  }

  const messageId = formString(formData, "messageId");
  const campaignId = formString(formData, "campaignId");
  if (!messageId) return { status: "error", message: "Message not found." };

  const result = await updateOutreachDraft({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    messageId,
    subject: formString(formData, "subject"),
    body: formString(formData, "body"),
  });

  if (!result.ok) return { status: "error", message: result.message };

  revalidateMessage(messageId, campaignId);
  return {
    status: "success",
    message: "Draft saved. Approval is required again before this can be sent.",
  };
}

export async function approveOutreachMessageAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!canApproveOutreach(context.role)) {
    return { status: "error", message: "Only workspace admins can approve outreach." };
  }

  const messageId = formString(formData, "messageId");
  const campaignId = formString(formData, "campaignId");

  const result = await approveOutreachMessage({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    messageId,
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidateMessage(messageId, campaignId);
  return {
    status: "success",
    message: "Approved. The exact content is now locked for sending.",
  };
}

export async function cancelOutreachMessageAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "MEMBER")) {
    return { status: "error", message: "You do not have permission to cancel outreach." };
  }

  const messageId = formString(formData, "messageId");
  const campaignId = formString(formData, "campaignId");

  const result = await cancelOutreachMessage({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    messageId,
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidateMessage(messageId, campaignId);
  return { status: "success", message: "Message cancelled. Nothing will be sent." };
}

export async function sendOutreachMessageAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!canApproveOutreach(context.role)) {
    return { status: "error", message: "Only workspace admins can send outreach." };
  }

  const messageId = formString(formData, "messageId");
  const campaignId = formString(formData, "campaignId");

  const result = await sendOutreachMessage({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    messageId,
  });
  if (!result.ok) {
    revalidateMessage(messageId, campaignId);
    return { status: "error", message: result.message };
  }

  revalidateMessage(messageId, campaignId);
  return {
    status: "success",
    message: "Message sent. The send, approval, and unsubscribe link are recorded.",
  };
}

export async function recordOutreachOutcomeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "MEMBER")) {
    return { status: "error", message: "You do not have permission to record outcomes." };
  }

  const messageId = formString(formData, "messageId");
  const campaignId = formString(formData, "campaignId");
  if (!messageId) return { status: "error", message: "Message not found." };

  const result = await recordOutreachOutcome({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    messageId,
    outcome: formString(formData, "outcome"),
    note: formString(formData, "note"),
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidateMessage(messageId, campaignId);
  return {
    status: "success",
    message: "Outcome recorded. It is stored as a manual observation, not provider tracking.",
  };
}
