import "server-only";

import { db } from "@/lib/db";

export type CampaignAnalytics = {
  leads: number;
  drafted: number;
  approved: number;
  sent: number;
  replied: number;
  meetings: number;
  bounced: number;
  replyRate: number;
  meetingRate: number;
  /** Provider webhooks are not connected, so opens are not observed. */
  opensTracked: false;
};

/**
 * Campaign results built from recorded sends and manually logged outcomes.
 * Nothing here is inferred: a reply only counts when someone recorded it.
 */
export async function getCampaignAnalytics(
  workspaceId: string,
  campaignId: string,
): Promise<CampaignAnalytics | null> {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId },
    select: { id: true },
  });
  if (!campaign) return null;

  const [leads, messages] = await Promise.all([
    db.campaignLead.findMany({
      where: { campaignId, lead: { deletedAt: null } },
      select: { stage: true },
    }),
    db.outreachMessage.findMany({
      where: { workspaceId, campaignId },
      select: {
        status: true,
        sentAt: true,
        repliedAt: true,
        meetingAt: true,
        bouncedAt: true,
      },
    }),
  ]);

  const sentMessages = messages.filter(
    (message) => message.sentAt !== null || ["SENT", "BOUNCED"].includes(message.status),
  );
  const sent = sentMessages.length;
  const replied = messages.filter((message) => message.repliedAt !== null).length;
  const meetings = messages.filter((message) => message.meetingAt !== null).length;
  const bounced = messages.filter((message) => message.bouncedAt !== null).length;

  return {
    leads: leads.length,
    drafted: leads.filter((row) => row.stage === "DRAFTED").length,
    approved: leads.filter((row) => row.stage === "APPROVED").length,
    sent,
    replied,
    meetings,
    bounced,
    replyRate: sent === 0 ? 0 : Math.round((replied / sent) * 100),
    meetingRate: sent === 0 ? 0 : Math.round((meetings / sent) * 100),
    opensTracked: false,
  };
}
