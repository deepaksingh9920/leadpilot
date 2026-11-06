import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTempDatabase, createTestTenant } from "@/test/temp-db";

// Delivery is intentionally unconfigured here. Every environment flag is fixed
// before the dynamic imports because `env` is evaluated at module load time.
const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;
process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-bytes-long";
process.env.APP_URL = "https://app.leadpilot.test";
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const { db } = await import("@/lib/db");
const { approveOutreachMessage, createOutreachDraft, sendOutreachMessage } = await import(
  "@/server/services/outreach"
);

let tenant: Awaited<ReturnType<typeof createTestTenant>>;

beforeAll(async () => {
  tenant = await createTestTenant(db, { key: "outreach-unconfigured" });
});

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

describe("outreach without an email provider", () => {
  it("keeps the message approved and reports NOT_CONFIGURED", async () => {
    await db.businessProfile.create({
      data: {
        workspaceId: tenant.workspace.id,
        companyName: "Sender Co",
        senderName: "Alex",
        mailingAddress: "1 Main St, Springfield, IL 62701",
      },
    });

    const lead = await db.lead.create({
      data: {
        workspaceId: tenant.workspace.id,
        companyName: "Acme Logistics",
        contactEmail: "dana@acme.test",
      },
    });
    const campaign = await db.campaign.create({
      data: {
        workspaceId: tenant.workspace.id,
        name: "Unconfigured campaign",
        createdById: tenant.user.id,
        status: "ACTIVE",
      },
    });
    await db.campaignLead.create({ data: { campaignId: campaign.id, leadId: lead.id } });

    const draft = await createOutreachDraft({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      campaignId: campaign.id,
      leadId: lead.id,
    });
    if (!draft.ok) throw new Error(draft.message);

    const approved = await approveOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: draft.messageId,
    });
    expect(approved.ok).toBe(true);

    const result = await sendOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: draft.messageId,
    });
    expect(result).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });

    const message = await db.outreachMessage.findUniqueOrThrow({
      where: { id: draft.messageId },
    });
    expect(message.status).toBe("APPROVED");
    expect(message.sentAt).toBeNull();
  });
});
