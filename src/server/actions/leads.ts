"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { getAuthContext, roleAtLeast } from "@/lib/auth/workspace";
import { formString, type FormState } from "@/lib/form";
import { writeAuditLog } from "@/lib/auth/audit";
import { LEAD_STATUSES, type LeadStatus } from "@/server/services/leads";

async function loadLead(workspaceId: string, leadId: string) {
  return db.lead.findFirst({
    where: { id: leadId, workspaceId, deletedAt: null },
    select: { id: true, companyName: true, status: true },
  });
}

export async function updateLeadStatusAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "MEMBER")) {
    return { status: "error", message: "You do not have permission to change lead status." };
  }

  const leadId = formString(formData, "leadId");
  const status = formString(formData, "status");
  if (!LEAD_STATUSES.includes(status as LeadStatus)) {
    return { status: "error", message: "Choose a valid lead status." };
  }

  const lead = await loadLead(context.workspace.id, leadId);
  if (!lead) return { status: "error", message: "Lead not found." };
  if (lead.status === status) return { status: "success", message: "Status unchanged." };

  await db.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: lead.id }, data: { status } });
    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        actorId: context.user.id,
        type: "STATUS_CHANGED",
        detail: JSON.stringify({ from: lead.status, to: status }),
      },
    });
  });

  await writeAuditLog({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    action: "lead.status_changed",
    entityType: "Lead",
    entityId: lead.id,
    metadata: { from: lead.status, to: status },
  });

  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/leads");
  return { status: "success", message: "Lead status updated." };
}

export async function saveLeadNotesAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "MEMBER")) {
    return { status: "error", message: "You do not have permission to edit lead notes." };
  }

  const leadId = formString(formData, "leadId");
  const notes = formString(formData, "notes").trim();
  if (notes.length > 5000) {
    return { status: "error", fieldErrors: { notes: ["Notes must be 5,000 characters or fewer."] } };
  }

  const lead = await loadLead(context.workspace.id, leadId);
  if (!lead) return { status: "error", message: "Lead not found." };

  await db.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: lead.id }, data: { notes: notes || null } });
    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        actorId: context.user.id,
        type: "NOTE_UPDATED",
        detail: JSON.stringify({ length: notes.length }),
      },
    });
  });

  await writeAuditLog({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    action: "lead.notes_updated",
    entityType: "Lead",
    entityId: lead.id,
    metadata: { length: notes.length },
  });

  revalidatePath(`/leads/${lead.id}`);
  return { status: "success", message: "Notes saved." };
}

export async function deleteLeadAction(formData: FormData): Promise<void> {
  const context = await getAuthContext();
  if (!context?.workspace) redirect("/login");
  if (!roleAtLeast(context.role, "ADMIN")) redirect("/leads");

  const leadId = formString(formData, "leadId");
  const lead = await loadLead(context.workspace.id, leadId);
  if (!lead) redirect("/leads");

  await db.lead.update({
    where: { id: lead.id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    action: "lead.deleted",
    entityType: "Lead",
    entityId: lead.id,
    metadata: { companyName: lead.companyName },
  });

  revalidatePath("/leads");
  redirect("/leads?deleted=1");
}
