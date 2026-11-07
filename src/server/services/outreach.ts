import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import {
  buildTemplateDraft,
  outreachApprovalHash,
  validateOutreachContent,
} from "@/lib/outreach/template";
import { buildOutreachPreview } from "@/lib/outreach/unsubscribe";
import { normalizeEmail, sha256 } from "@/lib/security/hash";
import {
  isSuppressed,
  normalizeSuppressionEmail,
} from "@/server/services/suppression";
import {
  getWorkspaceLimits,
  periodStartForMetric,
  releaseUsage,
  reserveUsage,
} from "@/server/services/workspaces";

export const OUTREACH_STATUSES = [
  "DRAFT",
  "APPROVED",
  "SENDING",
  "SCHEDULED",
  "SENT",
  "BOUNCED",
  "FAILED",
  "CANCELLED",
] as const;

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const OUTREACH_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  SENDING: "Sending",
  SCHEDULED: "Scheduled",
  SENT: "Sent",
  BOUNCED: "Bounced",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const OUTREACH_OUTCOMES = ["REPLIED", "MEETING", "BOUNCED"] as const;

export type OutreachOutcome = (typeof OUTREACH_OUTCOMES)[number];

export const OUTREACH_OUTCOME_LABELS: Record<OutreachOutcome, string> = {
  REPLIED: "Replied",
  MEETING: "Meeting booked",
  BOUNCED: "Hard bounce",
};

export type OutreachErrorCode =
  | "NOT_FOUND"
  | "INVALID"
  | "CONFLICT"
  | "LIMIT"
  | "NOT_CONFIGURED"
  | "SUPPRESSED"
  | "PROVIDER";

export type OutreachFailure = {
  ok: false;
  code: OutreachErrorCode;
  message: string;
};

const OUTREACH_STAGE_RANK: Record<string, number> = {
  ADDED: 0,
  DRAFTED: 1,
  APPROVED: 2,
  SENT: 3,
  REPLIED: 4,
  MEETING: 5,
};

const MESSAGE_RELATIONS = {
  lead: {
    select: {
      id: true,
      companyName: true,
      contactName: true,
      contactEmail: true,
      industry: true,
      location: true,
      status: true,
      deletedAt: true,
      verifications: {
        where: { field: "contactEmail" },
        take: 1,
        select: { status: true, sourceUrl: true, checkedAt: true },
      },
    },
  },
  campaign: { select: { id: true, name: true, status: true, dailySendCap: true } },
  workspace: { select: { id: true, name: true, profile: true } },
  createdBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
} satisfies Prisma.OutreachMessageInclude;

type LoadedMessage = Prisma.OutreachMessageGetPayload<{ include: typeof MESSAGE_RELATIONS }>;

async function loadMessage(
  workspaceId: string,
  messageId: string,
): Promise<LoadedMessage | null> {
  return db.outreachMessage.findFirst({
    where: { id: messageId, workspaceId },
    include: MESSAGE_RELATIONS,
  });
}

/**
 * Keeps the campaign pipeline honest after a draft, approval, cancellation, or
 * send. A replied lead is never downgraded by later bookkeeping.
 */
async function syncCampaignLeadStage(
  tx: Prisma.TransactionClient,
  campaignId: string,
  leadId: string,
): Promise<void> {
  const [campaignLead, messages] = await Promise.all([
    tx.campaignLead.findUnique({
      where: { campaignId_leadId: { campaignId, leadId } },
      select: { stage: true },
    }),
    tx.outreachMessage.findMany({
      where: { campaignId, leadId },
      select: { status: true },
    }),
  ]);

  if (!campaignLead || ["REPLIED", "MEETING"].includes(campaignLead.stage)) return;

  const has = (statuses: string[]) => messages.some((row) => statuses.includes(row.status));
  const desired = has(["SENT"])
    ? "SENT"
    : has(["APPROVED", "SCHEDULED", "SENDING"])
      ? "APPROVED"
      : has(["DRAFT"])
        ? "DRAFTED"
        : "ADDED";

  if ((OUTREACH_STAGE_RANK[desired] ?? 0) === (OUTREACH_STAGE_RANK[campaignLead.stage] ?? 0)) {
    return;
  }

  await tx.campaignLead.update({
    where: { campaignId_leadId: { campaignId, leadId } },
    data: { stage: desired },
  });
}

function contentIsValid(subject: string, body: string): OutreachFailure | null {
  const errors = validateOutreachContent(subject, body);
  if (errors.length === 0) return null;
  return { ok: false, code: "INVALID", message: errors[0] };
}

export async function createOutreachDraft(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  leadId: string;
  subject?: string;
  body?: string;
}): Promise<{ ok: true; messageId: string } | OutreachFailure> {
  const campaign = await db.campaign.findFirst({
    where: { id: input.campaignId, workspaceId: input.workspaceId },
    include: { workspace: { include: { profile: true } } },
  });
  if (!campaign) {
    return { ok: false, code: "NOT_FOUND", message: "Campaign not found." };
  }

  const campaignLead = await db.campaignLead.findUnique({
    where: { campaignId_leadId: { campaignId: campaign.id, leadId: input.leadId } },
    include: { lead: true },
  });
  if (!campaignLead || campaignLead.lead.deletedAt) {
    return {
      ok: false,
      code: "INVALID",
      message: "Add this lead to the campaign before drafting outreach.",
    };
  }

  const lead = campaignLead.lead;
  const email = normalizeSuppressionEmail(lead.contactEmail);
  if (!email) {
    return {
      ok: false,
      code: "INVALID",
      message: "This lead has no valid contact email, so a draft cannot be prepared.",
    };
  }
  if (await isSuppressed(input.workspaceId, email)) {
    return {
      ok: false,
      code: "SUPPRESSED",
      message: `${email} is on the suppression list and cannot be contacted.`,
    };
  }

  const existing = await db.outreachMessage.findFirst({
    where: {
      workspaceId: input.workspaceId,
      campaignId: campaign.id,
      leadId: lead.id,
      status: { in: ["DRAFT", "APPROVED", "SENDING", "SCHEDULED", "SENT"] },
    },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "An outreach message already exists for this lead in the campaign.",
    };
  }

  const profile = campaign.workspace.profile;
  const template = buildTemplateDraft(lead, {
    companyName: profile?.companyName ?? campaign.workspace.name,
    valueProposition: profile?.valueProposition,
    senderName: profile?.senderName,
  });

  const subject = (input.subject?.trim() || template.subject).trim();
  const body = (input.body?.trim() || template.body).trim();
  const invalid = contentIsValid(subject, body);
  if (invalid) return invalid;

  const created = await db.$transaction(async (tx) => {
    const message = await tx.outreachMessage.create({
      data: {
        workspaceId: input.workspaceId,
        campaignId: campaign.id,
        leadId: lead.id,
        createdById: input.userId,
        subject,
        body,
        status: "DRAFT",
      },
      select: { id: true },
    });

    await syncCampaignLeadStage(tx, campaign.id, lead.id);
    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        actorId: input.userId,
        type: "OUTREACH_DRAFTED",
        detail: JSON.stringify({ messageId: message.id, campaignId: campaign.id }),
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.userId,
        action: "outreach.drafted",
        entityType: "OutreachMessage",
        entityId: message.id,
        metadata: JSON.stringify({ campaignId: campaign.id, leadId: lead.id }),
      },
    });

    return message;
  });

  return { ok: true, messageId: created.id };
}

export async function updateOutreachDraft(input: {
  workspaceId: string;
  userId: string;
  messageId: string;
  subject: string;
  body: string;
}): Promise<{ ok: true } | OutreachFailure> {
  const message = await loadMessage(input.workspaceId, input.messageId);
  if (!message) return { ok: false, code: "NOT_FOUND", message: "Message not found." };
  if (!["DRAFT", "APPROVED"].includes(message.status)) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "Only drafts and approved messages can be edited.",
    };
  }

  const subject = input.subject.trim();
  const body = input.body.trim();
  const invalid = contentIsValid(subject, body);
  if (invalid) return invalid;

  await db.$transaction(async (tx) => {
    await tx.outreachMessage.update({
      where: { id: message.id },
      data: {
        subject,
        body,
        // Editing an approved message revokes approval. It must be approved again.
        status: "DRAFT",
        approvedById: null,
        approvedAt: null,
        approvedContentHash: null,
        failureReason: null,
      },
    });

    if (message.campaignId) {
      await syncCampaignLeadStage(tx, message.campaignId, message.leadId);
    }
    await tx.leadActivity.create({
      data: {
        leadId: message.leadId,
        actorId: input.userId,
        type: "OUTREACH_DRAFTED",
        detail: JSON.stringify({
          messageId: message.id,
          campaignId: message.campaignId,
          edited: true,
        }),
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.userId,
        action: "outreach.edited",
        entityType: "OutreachMessage",
        entityId: message.id,
        metadata: JSON.stringify({ revokedApproval: message.status === "APPROVED" }),
      },
    });
  });

  return { ok: true };
}

export async function approveOutreachMessage(input: {
  workspaceId: string;
  actorId: string;
  messageId: string;
}): Promise<{ ok: true } | OutreachFailure> {
  const message = await loadMessage(input.workspaceId, input.messageId);
  if (!message) return { ok: false, code: "NOT_FOUND", message: "Message not found." };
  if (message.status !== "DRAFT") {
    return {
      ok: false,
      code: "CONFLICT",
      message: "Only a draft can be approved. Edit it first if it was already approved.",
    };
  }
  if (message.lead.deletedAt) {
    return { ok: false, code: "INVALID", message: "This lead has been deleted." };
  }

  const invalid = contentIsValid(message.subject, message.body);
  if (invalid) return invalid;

  const email = normalizeSuppressionEmail(message.lead.contactEmail);
  if (!email) {
    return {
      ok: false,
      code: "INVALID",
      message: "Add a valid contact email to the lead before approving outreach.",
    };
  }
  if (await isSuppressed(input.workspaceId, email)) {
    return {
      ok: false,
      code: "SUPPRESSED",
      message: `${email} is on the suppression list and cannot be contacted.`,
    };
  }
  if (!message.workspace.profile?.mailingAddress?.trim()) {
    return {
      ok: false,
      code: "INVALID",
      message:
        "Add your company mailing address in Settings before approving outreach. It is required in every email footer.",
    };
  }

  const contentHash = outreachApprovalHash(message.subject, message.body);
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.outreachMessage.update({
      where: { id: message.id },
      data: {
        status: "APPROVED",
        approvedById: input.actorId,
        approvedAt: now,
        approvedContentHash: contentHash,
        failureReason: null,
      },
    });

    if (message.campaignId) {
      await syncCampaignLeadStage(tx, message.campaignId, message.leadId);
    }
    await tx.leadActivity.create({
      data: {
        leadId: message.leadId,
        actorId: input.actorId,
        type: "OUTREACH_APPROVED",
        detail: JSON.stringify({ messageId: message.id, campaignId: message.campaignId }),
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "outreach.approved",
        entityType: "OutreachMessage",
        entityId: message.id,
        metadata: JSON.stringify({ contentHash }),
      },
    });
  });

  return { ok: true };
}

export async function cancelOutreachMessage(input: {
  workspaceId: string;
  actorId: string;
  messageId: string;
}): Promise<{ ok: true } | OutreachFailure> {
  const message = await loadMessage(input.workspaceId, input.messageId);
  if (!message) return { ok: false, code: "NOT_FOUND", message: "Message not found." };
  if (message.status === "SENT") {
    return { ok: false, code: "CONFLICT", message: "A sent message cannot be cancelled." };
  }
  if (message.status === "CANCELLED") {
    return { ok: false, code: "CONFLICT", message: "This message is already cancelled." };
  }

  await db.$transaction(async (tx) => {
    await tx.outreachMessage.update({
      where: { id: message.id },
      data: { status: "CANCELLED", failureReason: null },
    });

    if (message.campaignId) {
      await syncCampaignLeadStage(tx, message.campaignId, message.leadId);
    }
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "outreach.cancelled",
        entityType: "OutreachMessage",
        entityId: message.id,
        metadata: JSON.stringify({ previousStatus: message.status }),
      },
    });
  });

  return { ok: true };
}

async function revertSend(
  messageId: string,
  workspaceId: string,
  actorId: string | null,
  reason: string,
  releaseReservedUsage: boolean,
): Promise<void> {
  await db.$transaction(async (tx) => {
    if (releaseReservedUsage) {
      await releaseUsage(tx, workspaceId, "sends_per_day", 1);
    }
    await tx.outreachMessage.update({
      where: { id: messageId },
      data: { status: "APPROVED", failureReason: reason.slice(0, 500) },
    });
    await tx.auditLog.create({
      data: {
        workspaceId,
        actorId,
        action: "outreach.send_failed",
        entityType: "OutreachMessage",
        entityId: messageId,
        metadata: JSON.stringify({ reason: reason.slice(0, 500) }),
      },
    });
  });
}

/**
 * Sends exactly one approved message. Approval is re-checked against the stored
 * content hash, suppression is re-checked at send time, and the plan's daily
 * send allowance is reserved transactionally before the provider is called.
 */
export async function sendOutreachMessage(input: {
  workspaceId: string;
  actorId: string;
  messageId: string;
}): Promise<{ ok: true; providerMessageId?: string } | OutreachFailure> {
  const message = await loadMessage(input.workspaceId, input.messageId);
  if (!message) return { ok: false, code: "NOT_FOUND", message: "Message not found." };
  if (message.status !== "APPROVED") {
    return {
      ok: false,
      code: "CONFLICT",
      message: "Approve this message before sending. Sends cannot be triggered from a draft.",
    };
  }
  if (!message.approvedContentHash) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "This message has no approval record. Approve it again before sending.",
    };
  }
  if (message.approvedContentHash !== outreachApprovalHash(message.subject, message.body)) {
    return {
      ok: false,
      code: "CONFLICT",
      message:
        "The message content changed after approval, so it was not sent. Edit and approve it again.",
    };
  }

  const email = normalizeSuppressionEmail(message.lead.contactEmail);
  if (!email) {
    return {
      ok: false,
      code: "INVALID",
      message: "This lead has no valid contact email.",
    };
  }
  if (!message.workspace.profile?.mailingAddress?.trim()) {
    return {
      ok: false,
      code: "INVALID",
      message: "Add your company mailing address in Settings before sending.",
    };
  }
  if (!env.emailConfigured) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message:
        "Email delivery is not configured. Add RESEND_API_KEY and EMAIL_FROM, then retry the send.",
    };
  }

  // Claim the message atomically so two requests cannot both send it.
  const claim = await db.outreachMessage.updateMany({
    where: { id: message.id, workspaceId: input.workspaceId, status: "APPROVED" },
    data: { status: "SENDING", failureReason: null },
  });
  if (claim.count !== 1) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "This message is already being sent or was changed.",
    };
  }

  try {
    if (await isSuppressed(input.workspaceId, email)) {
      await db.$transaction(async (tx) => {
        await tx.outreachMessage.update({
          where: { id: message.id },
          data: {
            status: "CANCELLED",
            failureReason: "Recipient is on the suppression list.",
          },
        });
        if (message.campaignId) {
          await syncCampaignLeadStage(tx, message.campaignId, message.leadId);
        }
        await tx.auditLog.create({
          data: {
            workspaceId: input.workspaceId,
            actorId: input.actorId,
            action: "outreach.blocked_suppressed",
            entityType: "OutreachMessage",
            entityId: message.id,
            metadata: JSON.stringify({ campaignId: message.campaignId }),
          },
        });
      });
      return {
        ok: false,
        code: "SUPPRESSED",
        message: `${email} is on the suppression list. The message was cancelled before sending.`,
      };
    }

    if (message.campaign) {
      if (message.campaign.status !== "ACTIVE") {
        await revertSend(
          message.id,
          input.workspaceId,
          input.actorId,
          "The campaign is not active.",
          false,
        );
        return {
          ok: false,
          code: "CONFLICT",
          message: "Activate the campaign before sending this message.",
        };
      }

      const sentToday = await db.outreachMessage.count({
        where: {
          campaignId: message.campaign.id,
          status: "SENT",
          sentAt: { gte: periodStartForMetric("sends_per_day") },
        },
      });
      if (sentToday >= message.campaign.dailySendCap) {
        await revertSend(
          message.id,
          input.workspaceId,
          input.actorId,
          "Campaign daily send cap reached.",
          false,
        );
        return {
          ok: false,
          code: "LIMIT",
          message: `This campaign has reached its daily cap of ${message.campaign.dailySendCap}.`,
        };
      }
    }

    const limits = await getWorkspaceLimits(input.workspaceId);
    const sendLimit = limits.sends_per_day ?? 0;
    const reserved = await db.$transaction((tx) =>
      reserveUsage(tx, input.workspaceId, "sends_per_day", 1, sendLimit),
    );
    if (!reserved.ok) {
      await revertSend(
        message.id,
        input.workspaceId,
        input.actorId,
        reserved.reason,
        false,
      );
      return { ok: false, code: "LIMIT", message: reserved.reason };
    }

    const profile = message.workspace.profile;
    const preview = buildOutreachPreview({
      workspaceId: input.workspaceId,
      messageId: message.id,
      email,
      subject: message.subject,
      body: message.body,
      leadCompanyName: message.lead.companyName,
      senderName: profile?.senderName,
      companyName: profile?.companyName ?? message.workspace.name,
      mailingAddress: profile?.mailingAddress,
    });

    const delivery = await sendEmail({
      to: email,
      subject: preview.subject,
      text: preview.text,
      html: preview.html,
      replyTo: profile?.senderEmail ?? undefined,
    });

    if (!delivery.ok) {
      await revertSend(
        message.id,
        input.workspaceId,
        input.actorId,
        delivery.message,
        true,
      );
      return {
        ok: false,
        code: delivery.reason === "not_configured" ? "NOT_CONFIGURED" : "PROVIDER",
        message: delivery.message,
      };
    }

    const sentAt = new Date();
    await db.$transaction(async (tx) => {
      await tx.outreachMessage.update({
        where: { id: message.id },
        data: {
          status: "SENT",
          sentAt,
          providerMessageId: delivery.providerMessageId ?? null,
          unsubscribeTokenHash: sha256(preview.token),
          failureReason: null,
        },
      });

      if (message.campaignId) {
        await syncCampaignLeadStage(tx, message.campaignId, message.leadId);
      }
      await tx.leadActivity.create({
        data: {
          leadId: message.leadId,
          actorId: input.actorId,
          type: "OUTREACH_SENT",
          detail: JSON.stringify({
            messageId: message.id,
            campaignId: message.campaignId,
            providerMessageId: delivery.providerMessageId ?? null,
          }),
        },
      });
      await tx.lead.updateMany({
        where: { id: message.leadId, status: { not: "CONVERTED" } },
        data: { status: "CONTACTED" },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          action: "outreach.sent",
          entityType: "OutreachMessage",
          entityId: message.id,
          metadata: JSON.stringify({
            campaignId: message.campaignId,
            leadId: message.leadId,
            providerMessageId: delivery.providerMessageId ?? null,
          }),
        },
      });
    });

    return { ok: true, providerMessageId: delivery.providerMessageId };
  } catch (error) {
    console.error("Outreach send failed unexpectedly", error);
    await revertSend(
      message.id,
      input.workspaceId,
      input.actorId,
      "An unexpected error interrupted the send.",
      true,
    ).catch(() => undefined);
    return {
      ok: false,
      code: "PROVIDER",
      message: "The send could not be completed. Check the message and try again.",
    };
  }
}

export async function recordOutreachOutcome(input: {
  workspaceId: string;
  actorId: string;
  messageId: string;
  outcome: string;
  note?: string | null;
}): Promise<{ ok: true } | OutreachFailure> {
  const outcome = input.outcome.trim();
  if (!(OUTREACH_OUTCOMES as readonly string[]).includes(outcome)) {
    return { ok: false, code: "INVALID", message: "Choose a valid outreach outcome." };
  }
  const typedOutcome = outcome as OutreachOutcome;

  const message = await loadMessage(input.workspaceId, input.messageId);
  if (!message) return { ok: false, code: "NOT_FOUND", message: "Message not found." };
  if (!["SENT", "BOUNCED"].includes(message.status)) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "Record an outcome only after the message has been sent.",
    };
  }
  if (message.status === "BOUNCED" && typedOutcome !== "BOUNCED") {
    return {
      ok: false,
      code: "CONFLICT",
      message: "This message bounced, so it cannot also be marked as replied.",
    };
  }

  if (typedOutcome === "REPLIED" && message.repliedAt) return { ok: true };
  if (typedOutcome === "MEETING" && message.meetingAt) return { ok: true };
  if (typedOutcome === "BOUNCED" && message.bouncedAt) return { ok: true };

  const bouncedEmail =
    typedOutcome === "BOUNCED"
      ? normalizeSuppressionEmail(message.lead.contactEmail)
      : null;
  if (typedOutcome === "BOUNCED" && !bouncedEmail) {
    return {
      ok: false,
      code: "INVALID",
      message: "This lead has no valid email to add to the suppression list.",
    };
  }

  const note = input.note?.trim().slice(0, 500) || null;
  const now = new Date();
  const activityType =
    typedOutcome === "REPLIED"
      ? "OUTREACH_REPLIED"
      : typedOutcome === "MEETING"
        ? "OUTREACH_MEETING"
        : "OUTREACH_BOUNCED";
  const auditAction =
    typedOutcome === "REPLIED"
      ? "outreach.replied"
      : typedOutcome === "MEETING"
        ? "outreach.meeting"
        : "outreach.bounced";

  await db.$transaction(async (tx) => {
    const data: Prisma.OutreachMessageUpdateInput = {
      outcomeNote: note ?? message.outcomeNote,
    };
    if (typedOutcome === "REPLIED") {
      data.repliedAt = now;
    } else if (typedOutcome === "MEETING") {
      data.meetingAt = now;
      data.repliedAt = message.repliedAt ?? now;
    } else {
      data.bouncedAt = now;
      data.status = "BOUNCED";
    }

    await tx.outreachMessage.update({ where: { id: message.id }, data });

    if (message.campaignId) {
      const campaignLead = await tx.campaignLead.findUnique({
        where: {
          campaignId_leadId: { campaignId: message.campaignId, leadId: message.leadId },
        },
        select: { stage: true },
      });
      if (campaignLead) {
        if (typedOutcome === "MEETING") {
          await tx.campaignLead.update({
            where: {
              campaignId_leadId: {
                campaignId: message.campaignId,
                leadId: message.leadId,
              },
            },
            data: { stage: "MEETING" },
          });
        } else if (
          typedOutcome === "REPLIED" &&
          !["REPLIED", "MEETING"].includes(campaignLead.stage)
        ) {
          await tx.campaignLead.update({
            where: {
              campaignId_leadId: {
                campaignId: message.campaignId,
                leadId: message.leadId,
              },
            },
            data: { stage: "REPLIED" },
          });
        }
      }
    }

    if (typedOutcome === "BOUNCED" && bouncedEmail) {
      const existing = await tx.suppressionEntry.findUnique({
        where: {
          workspaceId_normalizedEmail: {
            workspaceId: input.workspaceId,
            normalizedEmail: bouncedEmail,
          },
        },
        select: { id: true },
      });
      if (!existing) {
        const entry = await tx.suppressionEntry.create({
          data: {
            workspaceId: input.workspaceId,
            email: (message.lead.contactEmail ?? bouncedEmail).trim().slice(0, 254),
            normalizedEmail: bouncedEmail,
            reason: "BOUNCED",
            source: `Hard bounce · message ${message.id}`,
          },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: {
            workspaceId: input.workspaceId,
            actorId: input.actorId,
            action: "suppression.added",
            entityType: "SuppressionEntry",
            entityId: entry.id,
            metadata: JSON.stringify({ reason: "BOUNCED", source: "Outreach hard bounce" }),
          },
        });
      }
    }

    await tx.leadActivity.create({
      data: {
        leadId: message.leadId,
        actorId: input.actorId,
        type: activityType,
        detail: JSON.stringify({
          messageId: message.id,
          campaignId: message.campaignId,
          outcome: typedOutcome,
          note,
        }),
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: auditAction,
        entityType: "OutreachMessage",
        entityId: message.id,
        metadata: JSON.stringify({
          campaignId: message.campaignId,
          leadId: message.leadId,
          note,
        }),
      },
    });
  });

  return { ok: true };
}

export async function getOutreachMessageDetail(workspaceId: string, messageId: string) {
  const message = await loadMessage(workspaceId, messageId);
  if (!message) return null;

  const profile = message.workspace.profile;
  const email = normalizeSuppressionEmail(message.lead.contactEmail);
  const preview =
    profile && email
      ? buildOutreachPreview({
          workspaceId,
          messageId: message.id,
          email,
          subject: message.subject,
          body: message.body,
          leadCompanyName: message.lead.companyName,
          senderName: profile.senderName,
          companyName: profile.companyName,
          mailingAddress: profile.mailingAddress,
        })
      : null;

  return { message, preview };
}

export type CampaignOutreachRow = {
  leadId: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  stage: string;
  message: {
    id: string;
    subject: string;
    status: string;
    createdAt: Date;
    sentAt: Date | null;
    failureReason: string | null;
  } | null;
};

export async function getCampaignOutreachState(
  workspaceId: string,
  campaignId: string,
): Promise<CampaignOutreachRow[] | null> {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId },
    select: { id: true },
  });
  if (!campaign) return null;

  const [leads, messages] = await Promise.all([
    db.campaignLead.findMany({
      where: { campaignId, lead: { deletedAt: null } },
      orderBy: { addedAt: "desc" },
      include: {
        lead: {
          select: {
            id: true,
            companyName: true,
            contactName: true,
            contactEmail: true,
          },
        },
      },
    }),
    db.outreachMessage.findMany({
      where: { workspaceId, campaignId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        leadId: true,
        subject: true,
        status: true,
        createdAt: true,
        sentAt: true,
        failureReason: true,
      },
    }),
  ]);

  const latestByLead = new Map<string, (typeof messages)[number]>();
  for (const message of messages) {
    if (!latestByLead.has(message.leadId)) latestByLead.set(message.leadId, message);
  }

  return leads.map((row) => ({
    leadId: row.lead.id,
    companyName: row.lead.companyName,
    contactName: row.lead.contactName,
    contactEmail: row.lead.contactEmail,
    stage: row.stage,
    message: latestByLead.get(row.lead.id) ?? null,
  }));
}

/** Used by the public unsubscribe route to normalize the signed token email. */
export function normalizeOutreachEmail(value: string): string {
  return normalizeEmail(value);
}
