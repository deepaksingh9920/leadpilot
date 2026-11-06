"use server";

import { revalidatePath } from "next/cache";

import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getAuthContext, roleAtLeast } from "@/lib/auth/workspace";
import { formString, type FormState } from "@/lib/form";
import {
  addSuppression,
  importSuppressionsCsv,
  removeSuppression,
  SUPPRESSION_REASONS,
  type SuppressionReason,
} from "@/server/services/suppression";

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export async function addSuppressionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "MEMBER")) {
    return { status: "error", message: "You do not have permission to manage suppression." };
  }

  const email = formString(formData, "email");
  const reasonInput = formString(formData, "reason");
  const reason = (SUPPRESSION_REASONS as readonly string[]).includes(reasonInput)
    ? (reasonInput as SuppressionReason)
    : "MANUAL";

  const result = await addSuppression({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    email,
    reason,
    source: "Added in settings",
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/settings/suppression");
  return { status: "success", message: `${result.entry.email} is now suppressed.` };
}

export async function importSuppressionsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "MEMBER")) {
    return { status: "error", message: "You do not have permission to manage suppression." };
  }

  const limit = await checkRateLimit(
    `suppression-import:${context.workspace.id}:${context.user.id}`,
    5,
    60,
  );
  if (!limit.allowed) {
    return {
      status: "error",
      message: `Too many imports. Try again in ${limit.retryAfterSeconds} seconds.`,
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose a CSV file with an Email column." };
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return { status: "error", message: "Keep the import under 2 MB." };
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return { status: "error", message: "Upload a .csv file." };
  }

  const content = await file.text();
  const result = await importSuppressionsCsv({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    content,
    filename: file.name,
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/settings/suppression");
  return {
    status: "success",
    message: `Checked ${result.total} row${result.total === 1 ? "" : "s"}: ${result.added} added, ${result.duplicates} already suppressed, ${result.invalid} invalid.`,
  };
}

export async function removeSuppressionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "ADMIN")) {
    return { status: "error", message: "Only admins can remove a suppression entry." };
  }

  const entryId = formString(formData, "entryId");
  const result = await removeSuppression({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    entryId,
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/settings/suppression");
  return {
    status: "success",
    message: "Suppression removed. Future drafts can contact this address again.",
  };
}
