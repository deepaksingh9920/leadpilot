"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/auth/audit";
import { getAuthContext, roleAtLeast } from "@/lib/auth/workspace";
import { formString, type FormState } from "@/lib/form";

const CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"] as const;
type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

function parseCap(value: string): number | null {
  const cap = Number.parseInt(value, 10);
  if (!Number.isInteger(cap) || cap < 1 || cap > 500) return null;
  return cap;
}

export async function createCampaignAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "MEMBER")) {
    return { status: "error", message: "You do not have permission to create campaigns." };
  }

  const name = formString(formData, "name").trim();
  const goal = formString(formData, "goal").trim();
  const cap = parseCap(formString(formData, "dailySendCap") || "50");

  const fieldErrors: Record<string, string[]> = {};
  if (name.length < 2) fieldErrors.name = ["Give the campaign a name of at least 2 characters."];
  if (name.length > 120) fieldErrors.name = ["Keep the name under 120 characters."];
  if (goal.length > 500) fieldErrors.goal = ["Keep the goal under 500 characters."];
  if (cap === null) fieldErrors.dailySendCap = ["Choose a daily cap between 1 and 500."];
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  const campaign = await db.campaign.create({
    data: {
      workspaceId: context.workspace.id,
      name,
      goal: goal || null,
      dailySendCap: cap ?? 50,
      createdById: context.user.id,
    },
  });

  await writeAuditLog({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    action: "campaign.created",
    entityType: "Campaign",
    entityId: campaign.id,
    metadata: { name, dailySendCap: campaign.dailySendCap },
  });

  redirect(`/campaigns/${campaign.id}`);
}

export async function addLeadsToCampaignAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "MEMBER")) {
    return { status: "error", message: "You do not have permission to edit campaigns." };
  }

  const campaignId = formString(formData, "campaignId");
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId: context.workspace.id },
    select: { id: true, name: true },
  });
  if (!campaign) return { status: "error", message: "Campaign not found." };

  const requested = formData
    .getAll("leadIds")
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (requested.length === 0) {
    return { status: "error", message: "Select at least one qualified lead to add." };
  }
  if (requested.length > 200) {
    return { status: "error", message: "Add at most 200 leads at a time." };
  }

  const leads = await db.lead.findMany({
    where: {
      id: { in: requested },
      workspaceId: context.workspace.id,
      status: "QUALIFIED",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (leads.length === 0) {
    return {
      status: "error",
      message: "None of the selected leads are qualified leads in this workspace.",
    };
  }

  const existing = await db.campaignLead.findMany({
    where: { campaignId: campaign.id, leadId: { in: leads.map((lead) => lead.id) } },
    select: { leadId: true },
  });
  const existingIds = new Set(existing.map((row) => row.leadId));
  const toAdd = leads.filter((lead) => !existingIds.has(lead.id));

  if (toAdd.length > 0) {
    await db.$transaction(async (tx) => {
      await tx.campaignLead.createMany({
        data: toAdd.map((lead) => ({ campaignId: campaign.id, leadId: lead.id })),
      });
      await tx.auditLog.create({
        data: {
          workspaceId: context.workspace!.id,
          actorId: context.user.id,
          action: "campaign.leads_added",
          entityType: "Campaign",
          entityId: campaign.id,
          metadata: JSON.stringify({ added: toAdd.length }),
        },
      });
    });
  }

  revalidatePath(`/campaigns/${campaign.id}`);
  revalidatePath("/campaigns");
  return {
    status: "success",
    message:
      toAdd.length === 0
        ? "Those leads are already in this campaign."
        : `Added ${toAdd.length} lead${toAdd.length === 1 ? "" : "s"}.`,
  };
}

export async function removeCampaignLeadAction(formData: FormData): Promise<void> {
  const context = await getAuthContext();
  if (!context?.workspace) redirect("/login");
  if (!roleAtLeast(context.role, "MEMBER")) redirect("/campaigns");

  const campaignId = formString(formData, "campaignId");
  const leadId = formString(formData, "leadId");
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId: context.workspace.id },
    select: { id: true },
  });
  if (!campaign) redirect("/campaigns");

  await db.campaignLead.deleteMany({ where: { campaignId: campaign.id, leadId } });
  await writeAuditLog({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    action: "campaign.lead_removed",
    entityType: "Campaign",
    entityId: campaign.id,
    metadata: { leadId },
  });
  revalidatePath(`/campaigns/${campaign.id}`);
}

export async function setCampaignStatusAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "ADMIN")) {
    return { status: "error", message: "Only admins can change a campaign's status." };
  }

  const campaignId = formString(formData, "campaignId");
  const status = formString(formData, "status");
  if (!CAMPAIGN_STATUSES.includes(status as CampaignStatus)) {
    return { status: "error", message: "Choose a valid campaign status." };
  }

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId: context.workspace.id },
    include: { _count: { select: { leads: true } } },
  });
  if (!campaign) return { status: "error", message: "Campaign not found." };

  if (status === "ACTIVE" && campaign._count.leads === 0) {
    return { status: "error", message: "Add at least one lead before activating this campaign." };
  }

  await db.$transaction(async (tx) => {
    await tx.campaign.update({ where: { id: campaign.id }, data: { status } });
    await tx.auditLog.create({
      data: {
        workspaceId: context.workspace!.id,
        actorId: context.user.id,
        action: "campaign.status_changed",
        entityType: "Campaign",
        entityId: campaign.id,
        metadata: JSON.stringify({ from: campaign.status, to: status }),
      },
    });
  });

  revalidatePath(`/campaigns/${campaign.id}`);
  revalidatePath("/campaigns");
  return { status: "success", message: `Campaign moved to ${status.toLowerCase()}.` };
}

export async function updateCampaignCapAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "ADMIN")) {
    return { status: "error", message: "Only admins can change the daily cap." };
  }

  const campaignId = formString(formData, "campaignId");
  const cap = parseCap(formString(formData, "dailySendCap"));
  if (cap === null) {
    return { status: "error", fieldErrors: { dailySendCap: ["Choose a daily cap between 1 and 500."] } };
  }

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId: context.workspace.id },
    select: { id: true },
  });
  if (!campaign) return { status: "error", message: "Campaign not found." };

  await db.campaign.update({ where: { id: campaign.id }, data: { dailySendCap: cap } });
  await writeAuditLog({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    action: "campaign.cap_changed",
    entityType: "Campaign",
    entityId: campaign.id,
    metadata: { dailySendCap: cap },
  });

  revalidatePath(`/campaigns/${campaign.id}`);
  return { status: "success", message: `Daily cap set to ${cap}.` };
}
