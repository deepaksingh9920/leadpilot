import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createTempDatabase, createTestTenant } from "@/test/temp-db";

// The Prisma client and the email adapter read configuration at import time, so
// every flag must be set before the dynamic imports below. Nothing is sent to a
// real provider: global fetch is stubbed in the tests that reach delivery.
const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;
process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-bytes-long";
process.env.APP_URL = "https://app.leadpilot.test";
process.env.RESEND_API_KEY = "re_test_key";
process.env.EMAIL_FROM = "LeadPilot <outreach@leadpilot.test>";
process.env.EMAIL_REPLY_TO = "reply@leadpilot.test";

const { db } = await import("@/lib/db");
const {
  approveOutreachMessage,
  cancelOutreachMessage,
  createOutreachDraft,
  getCampaignOutreachState,
  getOutreachMessageDetail,
  recordOutreachOutcome,
  sendOutreachMessage,
  updateOutreachDraft,
} = await import("@/server/services/outreach");
const { getCampaignAnalytics } = await import("@/server/services/campaign-analytics");
const { addSuppression, isSuppressed } = await import("@/server/services/suppression");
const { getUnsubscribePreview, unsubscribeWithToken } = await import(
  "@/server/services/unsubscribe"
);
const { createUnsubscribeToken } = await import("@/lib/outreach/unsubscribe");
const { outreachApprovalHash } = await import("@/lib/outreach/template");
const { normalizeEmail, sha256 } = await import("@/lib/security/hash");

type Tenant = Awaited<ReturnType<typeof createTestTenant>>;

const PROFILE = {
  companyName: "Sender Co",
  valueProposition: "We reduce dispatch delays for regional carriers.",
  senderName: "Alex Rivera",
  senderEmail: "alex@sender.test",
  mailingAddress: "1 Main St, Springfield, IL 62701",
};

let tenant: Tenant;
let emailCounter = 0;

function nextEmail(): string {
  emailCounter += 1;
  return `contact${emailCounter}@acme.test`;
}

async function addProfile(target: Tenant, overrides: Record<string, unknown> = {}) {
  return db.businessProfile.create({
    data: { workspaceId: target.workspace.id, ...PROFILE, ...overrides },
  });
}

async function baseFixture(options: {
  tenant?: Tenant;
  campaign?: { status?: string; dailySendCap?: number; name?: string };
  lead?: {
    contactEmail?: string | null;
    companyName?: string;
    contactName?: string | null;
  };
} = {}) {
  const target = options.tenant ?? tenant;
  const lead = await db.lead.create({
    data: {
      workspaceId: target.workspace.id,
      companyName: options.lead?.companyName ?? "Acme Logistics",
      contactName: options.lead?.contactName ?? "Dana",
      contactEmail:
        options.lead?.contactEmail === undefined ? nextEmail() : options.lead.contactEmail,
      industry: "Logistics",
      location: "Austin, TX",
    },
  });
  const campaign = await db.campaign.create({
    data: {
      workspaceId: target.workspace.id,
      name: options.campaign?.name ?? "Q3 logistics",
      createdById: target.user.id,
      status: options.campaign?.status ?? "ACTIVE",
      dailySendCap: options.campaign?.dailySendCap ?? 50,
    },
  });
  await db.campaignLead.create({
    data: { campaignId: campaign.id, leadId: lead.id },
  });
  return { tenant: target, lead, campaign };
}

async function draftFixture(options: Parameters<typeof baseFixture>[0] = {}) {
  const fixture = await baseFixture(options);
  const draft = await createOutreachDraft({
    workspaceId: fixture.tenant.workspace.id,
    userId: fixture.tenant.user.id,
    campaignId: fixture.campaign.id,
    leadId: fixture.lead.id,
  });
  if (!draft.ok) throw new Error(`Could not create draft: ${draft.message}`);
  return { ...fixture, messageId: draft.messageId };
}

async function approvedFixture(options: Parameters<typeof baseFixture>[0] = {}) {
  const fixture = await draftFixture(options);
  const approved = await approveOutreachMessage({
    workspaceId: fixture.tenant.workspace.id,
    actorId: fixture.tenant.user.id,
    messageId: fixture.messageId,
  });
  if (!approved.ok) throw new Error(`Could not approve draft: ${approved.message}`);
  return fixture;
}

async function messageRow(messageId: string) {
  return db.outreachMessage.findUniqueOrThrow({ where: { id: messageId } });
}

async function campaignLeadStage(campaignId: string, leadId: string) {
  const row = await db.campaignLead.findUniqueOrThrow({
    where: { campaignId_leadId: { campaignId, leadId } },
  });
  return row.stage;
}

async function sendUsage(workspaceId: string): Promise<number> {
  const counter = await db.usageCounter.findFirst({
    where: { workspaceId, metric: "sends_per_day" },
  });
  return counter?.used ?? 0;
}

function resendSuccess(id = "re_msg_123"): (url: string, init: RequestInit) => Promise<Response> {
  return async () =>
    new Response(JSON.stringify({ id }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
}

beforeAll(async () => {
  tenant = await createTestTenant(db, { key: "outreach" });
  await addProfile(tenant);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

describe("grounded outreach drafts", () => {
  it("creates a draft from stored facts and advances the campaign pipeline", async () => {
    const fixture = await draftFixture();
    const message = await messageRow(fixture.messageId);

    expect(message.status).toBe("DRAFT");
    expect(message.subject).toBe("A quick question for Acme Logistics");
    expect(message.body).toContain("Hi Dana,");
    expect(message.body).toContain("We reduce dispatch delays for regional carriers.");
    expect(message.body).toContain("Acme Logistics works in Logistics and is based in Austin, TX.");
    expect(await campaignLeadStage(fixture.campaign.id, fixture.lead.id)).toBe("DRAFTED");

    const activity = await db.leadActivity.findFirst({
      where: { leadId: fixture.lead.id, type: "OUTREACH_DRAFTED" },
    });
    expect(activity).not.toBeNull();

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "outreach.drafted" },
    });
    expect(audit?.entityId).toBe(fixture.messageId);

    const rows = await getCampaignOutreachState(tenant.workspace.id, fixture.campaign.id);
    expect(rows?.[0]?.message?.id).toBe(fixture.messageId);
  });

  it("honours an edited subject and body while validating the content", async () => {
    const fixture = await baseFixture();
    const created = await createOutreachDraft({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      campaignId: fixture.campaign.id,
      leadId: fixture.lead.id,
      subject: "Custom subject line",
      body: "Hi Dana,\n\nThis body is long enough to pass validation.",
    });
    if (!created.ok) throw new Error(created.message);

    const message = await messageRow(created.messageId);
    expect(message.subject).toBe("Custom subject line");
    expect(message.body).toBe("Hi Dana,\n\nThis body is long enough to pass validation.");

    const rejected = await updateOutreachDraft({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      messageId: created.messageId,
      subject: "x",
      body: "short",
    });
    expect(rejected).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("rejects a lead that is not part of the campaign", async () => {
    const fixture = await baseFixture({ lead: { contactEmail: nextEmail() } });
    const outsider = await db.lead.create({
      data: {
        workspaceId: tenant.workspace.id,
        companyName: "Not In Campaign",
        contactEmail: nextEmail(),
      },
    });

    const result = await createOutreachDraft({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      campaignId: fixture.campaign.id,
      leadId: outsider.id,
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("rejects a lead without a valid email", async () => {
    const fixture = await baseFixture({ lead: { contactEmail: null } });
    const result = await createOutreachDraft({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      campaignId: fixture.campaign.id,
      leadId: fixture.lead.id,
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID" });
    expect(await db.outreachMessage.count({ where: { leadId: fixture.lead.id } })).toBe(0);
  });

  it("rejects a suppressed recipient before creating a draft", async () => {
    const email = nextEmail();
    const fixture = await baseFixture({ lead: { contactEmail: email } });
    await addSuppression({
      workspaceId: tenant.workspace.id,
      email,
      reason: "UNSUBSCRIBED",
      source: "Previous request",
    });

    const result = await createOutreachDraft({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      campaignId: fixture.campaign.id,
      leadId: fixture.lead.id,
    });
    expect(result).toMatchObject({ ok: false, code: "SUPPRESSED" });
    expect(await db.outreachMessage.count({ where: { leadId: fixture.lead.id } })).toBe(0);
  });

  it("refuses a second active message but allows a new draft after cancelling", async () => {
    const fixture = await draftFixture();

    const duplicate = await createOutreachDraft({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      campaignId: fixture.campaign.id,
      leadId: fixture.lead.id,
    });
    expect(duplicate).toMatchObject({ ok: false, code: "CONFLICT" });

    const cancelled = await cancelOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: fixture.messageId,
    });
    expect(cancelled.ok).toBe(true);
    expect((await messageRow(fixture.messageId)).status).toBe("CANCELLED");
    expect(await campaignLeadStage(fixture.campaign.id, fixture.lead.id)).toBe("ADDED");

    const replacement = await createOutreachDraft({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      campaignId: fixture.campaign.id,
      leadId: fixture.lead.id,
    });
    expect(replacement.ok).toBe(true);
  });
});

describe("approval", () => {
  it("requires a mailing address before approving", async () => {
    const bareTenant = await createTestTenant(db, { key: "outreach-no-profile" });
    const fixture = await baseFixture({ tenant: bareTenant });
    const draft = await createOutreachDraft({
      workspaceId: bareTenant.workspace.id,
      userId: bareTenant.user.id,
      campaignId: fixture.campaign.id,
      leadId: fixture.lead.id,
    });
    if (!draft.ok) throw new Error(draft.message);

    const approved = await approveOutreachMessage({
      workspaceId: bareTenant.workspace.id,
      actorId: bareTenant.user.id,
      messageId: draft.messageId,
    });
    expect(approved).toMatchObject({ ok: false, code: "INVALID" });
    expect((await messageRow(draft.messageId)).status).toBe("DRAFT");
  });

  it("stores the approval actor and the exact content hash", async () => {
    const fixture = await approvedFixture();
    const message = await messageRow(fixture.messageId);

    expect(message.status).toBe("APPROVED");
    expect(message.approvedById).toBe(tenant.user.id);
    expect(message.approvedAt).not.toBeNull();
    expect(message.approvedContentHash).toBe(outreachApprovalHash(message.subject, message.body));
    expect(await campaignLeadStage(fixture.campaign.id, fixture.lead.id)).toBe("APPROVED");

    const activity = await db.leadActivity.findFirst({
      where: { leadId: fixture.lead.id, type: "OUTREACH_APPROVED" },
    });
    expect(activity).not.toBeNull();

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "outreach.approved" },
    });
    expect(audit?.entityId).toBe(fixture.messageId);
    expect(JSON.parse(audit?.metadata ?? "{}").contentHash).toBe(message.approvedContentHash);
  });

  it("revokes approval when the content is edited", async () => {
    const fixture = await approvedFixture();
    const before = await messageRow(fixture.messageId);

    const edited = await updateOutreachDraft({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      messageId: fixture.messageId,
      subject: "A revised subject",
      body: "A revised body with enough detail for validation.",
    });
    expect(edited.ok).toBe(true);

    const after = await messageRow(fixture.messageId);
    expect(after.status).toBe("DRAFT");
    expect(after.approvedById).toBeNull();
    expect(after.approvedAt).toBeNull();
    expect(after.approvedContentHash).toBeNull();
    expect(after.subject).not.toBe(before.subject);
    expect(await campaignLeadStage(fixture.campaign.id, fixture.lead.id)).toBe("DRAFTED");

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "outreach.edited" },
    });
    expect(JSON.parse(audit?.metadata ?? "{}").revokedApproval).toBe(true);
  });
});

describe("sending", () => {
  it("refuses to send while the platform switch is off", async () => {
    const fixture = await approvedFixture();
    await db.setting.upsert({
      where: { key: "feature.outreach_sending" },
      update: { value: "false" },
      create: { key: "feature.outreach_sending", value: "false" },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await sendOutreachMessage({
        workspaceId: tenant.workspace.id,
        actorId: tenant.user.id,
        messageId: fixture.messageId,
      });
      expect(result).toMatchObject({ ok: false, code: "DISABLED" });
      expect(fetchMock).not.toHaveBeenCalled();

      const message = await messageRow(fixture.messageId);
      expect(message.status).toBe("APPROVED");
      expect(await sendUsage(tenant.workspace.id)).toBe(0);
    } finally {
      await db.setting.deleteMany({ where: { key: "feature.outreach_sending" } });
    }
  });

  it("will not send content that changed after approval", async () => {
    const fixture = await approvedFixture();
    const message = await messageRow(fixture.messageId);
    await db.outreachMessage.update({
      where: { id: fixture.messageId },
      data: { body: `${message.body}\n\nInjected after approval.` },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: fixture.messageId,
    });
    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await messageRow(fixture.messageId)).status).toBe("APPROVED");
  });

  it("cancels the message when the recipient is suppressed after approval", async () => {
    const fixture = await approvedFixture();
    await addSuppression({
      workspaceId: tenant.workspace.id,
      email: fixture.lead.contactEmail!,
      reason: "COMPLAINT",
      source: "Complaint received",
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: fixture.messageId,
    });
    expect(result).toMatchObject({ ok: false, code: "SUPPRESSED" });
    expect(fetchMock).not.toHaveBeenCalled();

    const message = await messageRow(fixture.messageId);
    expect(message.status).toBe("CANCELLED");
    expect(message.failureReason).toContain("suppression list");

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "outreach.blocked_suppressed" },
    });
    expect(audit?.entityId).toBe(fixture.messageId);
  });

  it("requires an active campaign", async () => {
    const fixture = await approvedFixture();
    await db.campaign.update({
      where: { id: fixture.campaign.id },
      data: { status: "PAUSED" },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: fixture.messageId,
    });
    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(fetchMock).not.toHaveBeenCalled();

    const message = await messageRow(fixture.messageId);
    expect(message.status).toBe("APPROVED");
    expect(message.failureReason).toBe("The campaign is not active.");
  });

  it("enforces the campaign daily send cap", async () => {
    const fixture = await approvedFixture({ campaign: { dailySendCap: 1 } });

    // Another message already sent today consumes the campaign's single slot.
    const otherLead = await db.lead.create({
      data: {
        workspaceId: tenant.workspace.id,
        companyName: "Already Contacted",
        contactEmail: nextEmail(),
      },
    });
    await db.outreachMessage.create({
      data: {
        workspaceId: tenant.workspace.id,
        campaignId: fixture.campaign.id,
        leadId: otherLead.id,
        createdById: tenant.user.id,
        subject: "Earlier send",
        body: "An earlier message that was delivered.",
        status: "SENT",
        sentAt: new Date(),
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: fixture.messageId,
    });
    expect(result).toMatchObject({ ok: false, code: "LIMIT" });
    expect(fetchMock).not.toHaveBeenCalled();

    const message = await messageRow(fixture.messageId);
    expect(message.status).toBe("APPROVED");
    expect(message.failureReason).toBe("Campaign daily send cap reached.");
  });

  it("enforces the workspace's daily send allowance", async () => {
    const cappedTenant = await createTestTenant(db, { key: "outreach-capped", sendLimit: 0 });
    await addProfile(cappedTenant);
    const fixture = await approvedFixture({ tenant: cappedTenant });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendOutreachMessage({
      workspaceId: cappedTenant.workspace.id,
      actorId: cappedTenant.user.id,
      messageId: fixture.messageId,
    });
    expect(result).toMatchObject({ ok: false, code: "LIMIT" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await messageRow(fixture.messageId)).status).toBe("APPROVED");
  });

  it("delivers through Resend, records the provider id, and builds the footer", async () => {
    const fixture = await approvedFixture();
    const fetchMock = vi.fn(resendSuccess());
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: fixture.messageId,
    });
    expect(result).toEqual({ ok: true, providerMessageId: "re_msg_123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(String(init.body)) as {
      from: string;
      to: string[];
      reply_to?: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(payload.from).toContain("outreach@leadpilot.test");
    expect(payload.to).toEqual([normalizeEmail(fixture.lead.contactEmail!)]);
    expect(payload.reply_to).toBe(PROFILE.senderEmail);
    expect(payload.text).toContain("Unsubscribe:");
    expect(payload.text).toContain("1 Main St, Springfield, IL 62701");
    expect(payload.html).toContain("Unsubscribe</a>");

    const message = await messageRow(fixture.messageId);
    expect(message.status).toBe("SENT");
    expect(message.providerMessageId).toBe("re_msg_123");
    expect(message.sentAt).not.toBeNull();
    expect(message.failureReason).toBeNull();

    const token = createUnsubscribeToken({
      v: 1,
      workspaceId: tenant.workspace.id,
      messageId: fixture.messageId,
      email: normalizeEmail(fixture.lead.contactEmail!),
    });
    expect(message.unsubscribeTokenHash).toBe(sha256(token));

    expect(await campaignLeadStage(fixture.campaign.id, fixture.lead.id)).toBe("SENT");
    const lead = await db.lead.findUniqueOrThrow({ where: { id: fixture.lead.id } });
    expect(lead.status).toBe("CONTACTED");

    const activity = await db.leadActivity.findFirst({
      where: { leadId: fixture.lead.id, type: "OUTREACH_SENT" },
    });
    expect(activity).not.toBeNull();

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "outreach.sent" },
    });
    expect(audit?.entityId).toBe(fixture.messageId);
    expect(JSON.parse(audit?.metadata ?? "{}").providerMessageId).toBe("re_msg_123");
  });

  it("restores the approved state and releases the allowance when the provider fails", async () => {
    const fixture = await approvedFixture();
    const before = await sendUsage(tenant.workspace.id);

    const fetchMock = vi.fn(
      async () => new Response("rejected", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: fixture.messageId,
    });
    expect(result).toMatchObject({ ok: false, code: "PROVIDER" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const message = await messageRow(fixture.messageId);
    expect(message.status).toBe("APPROVED");
    expect(message.failureReason).toContain("provider rejected");
    expect(await sendUsage(tenant.workspace.id)).toBe(before);

    const audit = await db.auditLog.findFirst({
      where: {
        workspaceId: tenant.workspace.id,
        action: "outreach.send_failed",
        entityId: fixture.messageId,
      },
    });
    expect(audit?.entityId).toBe(fixture.messageId);
  });

  it("restores the approved state when the provider is unreachable", async () => {
    const fixture = await approvedFixture();
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: fixture.messageId,
    });
    expect(result).toMatchObject({ ok: false, code: "PROVIDER" });
    expect((await messageRow(fixture.messageId)).status).toBe("APPROVED");
  });

  it("never sends the same message twice", async () => {
    const fixture = await approvedFixture();
    vi.stubGlobal("fetch", vi.fn(resendSuccess("re_once")));

    const first = await sendOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: fixture.messageId,
    });
    expect(first.ok).toBe(true);

    const second = await sendOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: fixture.messageId,
    });
    expect(second).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("returns the exact delivery preview for an approved message", async () => {
    const fixture = await approvedFixture();
    const detail = await getOutreachMessageDetail(tenant.workspace.id, fixture.messageId);

    expect(detail).not.toBeNull();
    expect(detail?.preview?.subject).toBe(detail?.message.subject);
    expect(detail?.preview?.text).toContain("Unsubscribe:");
    expect(detail?.preview?.text).toContain(PROFILE.mailingAddress);
    expect(detail?.preview?.html).toContain("Unsubscribe");
  });
});

describe("manual outcomes", () => {
  let outcomeTenant: Tenant;

  beforeAll(async () => {
    outcomeTenant = await createTestTenant(db, { key: "outcomes" });
    await addProfile(outcomeTenant);
  });

  async function sentFixture() {
    const fixture = await approvedFixture({ tenant: outcomeTenant });
    vi.stubGlobal("fetch", vi.fn(resendSuccess(`re_${fixture.messageId}`)));
    const sent = await sendOutreachMessage({
      workspaceId: outcomeTenant.workspace.id,
      actorId: outcomeTenant.user.id,
      messageId: fixture.messageId,
    });
    if (!sent.ok) throw new Error(sent.message);
    vi.unstubAllGlobals();
    return fixture;
  }

  it("records a manual reply and advances the campaign stage", async () => {
    const fixture = await sentFixture();

    const result = await recordOutreachOutcome({
      workspaceId: outcomeTenant.workspace.id,
      actorId: outcomeTenant.user.id,
      messageId: fixture.messageId,
      outcome: "REPLIED",
      note: "Reply received in the shared inbox.",
    });
    expect(result).toEqual({ ok: true });

    const message = await messageRow(fixture.messageId);
    expect(message.status).toBe("SENT");
    expect(message.repliedAt).not.toBeNull();
    expect(message.outcomeNote).toBe("Reply received in the shared inbox.");
    expect(await campaignLeadStage(fixture.campaign.id, fixture.lead.id)).toBe("REPLIED");

    const activity = await db.leadActivity.findFirst({
      where: { leadId: fixture.lead.id, type: "OUTREACH_REPLIED" },
    });
    expect(activity).not.toBeNull();
    expect(JSON.parse(activity?.detail ?? "{}").outcome).toBe("REPLIED");

    const audit = await db.auditLog.findFirst({
      where: {
        workspaceId: outcomeTenant.workspace.id,
        action: "outreach.replied",
        entityId: fixture.messageId,
      },
    });
    expect(audit).not.toBeNull();

    // Recording the same manual outcome twice is idempotent.
    const again = await recordOutreachOutcome({
      workspaceId: outcomeTenant.workspace.id,
      actorId: outcomeTenant.user.id,
      messageId: fixture.messageId,
      outcome: "REPLIED",
    });
    expect(again).toEqual({ ok: true });
    expect((await messageRow(fixture.messageId)).repliedAt).not.toBeNull();
  });

  it("records a meeting as a reply plus a booked meeting", async () => {
    const fixture = await sentFixture();

    const result = await recordOutreachOutcome({
      workspaceId: outcomeTenant.workspace.id,
      actorId: outcomeTenant.user.id,
      messageId: fixture.messageId,
      outcome: "MEETING",
    });
    expect(result).toEqual({ ok: true });

    const message = await messageRow(fixture.messageId);
    expect(message.meetingAt).not.toBeNull();
    expect(message.repliedAt).not.toBeNull();
    expect(await campaignLeadStage(fixture.campaign.id, fixture.lead.id)).toBe("MEETING");

    const activity = await db.leadActivity.findFirst({
      where: { leadId: fixture.lead.id, type: "OUTREACH_MEETING" },
    });
    expect(activity).not.toBeNull();
  });

  it("records a hard bounce and suppresses the recipient exactly once", async () => {
    const fixture = await sentFixture();
    const email = normalizeEmail(fixture.lead.contactEmail!);

    const result = await recordOutreachOutcome({
      workspaceId: outcomeTenant.workspace.id,
      actorId: outcomeTenant.user.id,
      messageId: fixture.messageId,
      outcome: "BOUNCED",
      note: "Provider bounce notice.",
    });
    expect(result).toEqual({ ok: true });

    const message = await messageRow(fixture.messageId);
    expect(message.status).toBe("BOUNCED");
    expect(message.bouncedAt).not.toBeNull();

    const suppression = await db.suppressionEntry.findUnique({
      where: {
        workspaceId_normalizedEmail: {
          workspaceId: outcomeTenant.workspace.id,
          normalizedEmail: email,
        },
      },
    });
    expect(suppression?.reason).toBe("BOUNCED");
    expect(suppression?.source).toContain(fixture.messageId);
    expect(await isSuppressed(outcomeTenant.workspace.id, email)).toBe(true);

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: outcomeTenant.workspace.id, action: "suppression.added" },
    });
    expect(audit).not.toBeNull();

    const again = await recordOutreachOutcome({
      workspaceId: outcomeTenant.workspace.id,
      actorId: outcomeTenant.user.id,
      messageId: fixture.messageId,
      outcome: "BOUNCED",
    });
    expect(again).toEqual({ ok: true });
    expect(
      await db.suppressionEntry.count({
        where: { workspaceId: outcomeTenant.workspace.id, normalizedEmail: email },
      }),
    ).toBe(1);
  });

  it("rejects outcomes before sending and after a bounce", async () => {
    const draft = await draftFixture({ tenant: outcomeTenant });
    const beforeSend = await recordOutreachOutcome({
      workspaceId: outcomeTenant.workspace.id,
      actorId: outcomeTenant.user.id,
      messageId: draft.messageId,
      outcome: "REPLIED",
    });
    expect(beforeSend).toMatchObject({ ok: false, code: "CONFLICT" });
    expect((await messageRow(draft.messageId)).repliedAt).toBeNull();

    const fixture = await sentFixture();
    await recordOutreachOutcome({
      workspaceId: outcomeTenant.workspace.id,
      actorId: outcomeTenant.user.id,
      messageId: fixture.messageId,
      outcome: "BOUNCED",
    });

    const repliedAfterBounce = await recordOutreachOutcome({
      workspaceId: outcomeTenant.workspace.id,
      actorId: outcomeTenant.user.id,
      messageId: fixture.messageId,
      outcome: "REPLIED",
    });
    expect(repliedAfterBounce).toMatchObject({ ok: false, code: "CONFLICT" });

    const invalid = await recordOutreachOutcome({
      workspaceId: outcomeTenant.workspace.id,
      actorId: outcomeTenant.user.id,
      messageId: fixture.messageId,
      outcome: "OPENED",
    });
    expect(invalid).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("builds campaign analytics from recorded sends and outcomes only", async () => {
    const fixture = await sentFixture();
    await recordOutreachOutcome({
      workspaceId: outcomeTenant.workspace.id,
      actorId: outcomeTenant.user.id,
      messageId: fixture.messageId,
      outcome: "MEETING",
    });

    const analytics = await getCampaignAnalytics(
      outcomeTenant.workspace.id,
      fixture.campaign.id,
    );
    expect(analytics).toEqual({
      leads: 1,
      drafted: 0,
      approved: 0,
      sent: 1,
      replied: 1,
      meetings: 1,
      bounced: 0,
      replyRate: 100,
      meetingRate: 100,
      opensTracked: false,
    });

    expect(
      await getCampaignAnalytics(outcomeTenant.workspace.id, "missing-campaign"),
    ).toBeNull();
  });
});

describe("public unsubscribe", () => {
  async function sentFixture() {
    const fixture = await approvedFixture();
    vi.stubGlobal("fetch", vi.fn(resendSuccess("re_unsub")));
    const sent = await sendOutreachMessage({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      messageId: fixture.messageId,
    });
    if (!sent.ok) throw new Error(sent.message);
    vi.unstubAllGlobals();

    const email = normalizeEmail(fixture.lead.contactEmail!);
    const token = createUnsubscribeToken({
      v: 1,
      workspaceId: tenant.workspace.id,
      messageId: fixture.messageId,
      email,
    });
    return { ...fixture, token, email };
  }

  it("previews a signed link without exposing the raw address", async () => {
    const { token } = await sentFixture();
    const preview = await getUnsubscribePreview(token);

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.workspaceName).toBe(tenant.workspace.name);
    expect(preview.maskedEmail).toContain("@acme.test");
    expect(preview.maskedEmail).not.toContain("contact");
    expect(preview.alreadySuppressed).toBe(false);
  });

  it("suppresses the recipient and is idempotent", async () => {
    const { token, email, lead, messageId } = await sentFixture();

    const first = await unsubscribeWithToken(token);
    expect(first).toEqual({ ok: true, email, alreadySuppressed: false });
    expect(await isSuppressed(tenant.workspace.id, email)).toBe(true);

    const second = await unsubscribeWithToken(token);
    expect(second).toEqual({ ok: true, email, alreadySuppressed: true });

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "outreach.unsubscribed" },
    });
    expect(audit?.entityId).toBe(messageId);

    const activity = await db.leadActivity.findFirst({
      where: { leadId: lead.id, type: "UNSUBSCRIBED" },
    });
    expect(activity).not.toBeNull();
  });

  it("rejects a forged or malformed token", async () => {
    const { token, messageId } = await sentFixture();
    const [encoded, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        v: 1,
        workspaceId: tenant.workspace.id,
        messageId,
        email: "attacker@example.test",
      }),
    ).toString("base64url");

    expect(await unsubscribeWithToken(`${forgedPayload}.${signature}`)).toMatchObject({
      ok: false,
    });
    expect(await unsubscribeWithToken("not-a-token")).toMatchObject({ ok: false });
    expect((await getUnsubscribePreview(`${encoded}.tampered`)).ok).toBe(false);
  });

  it("binds the token to the recipient even if the hash is rewritten", async () => {
    const { messageId } = await sentFixture();
    const otherEmail = nextEmail();
    const otherToken = createUnsubscribeToken({
      v: 1,
      workspaceId: tenant.workspace.id,
      messageId,
      email: otherEmail,
    });

    // Simulate a stolen token being manually stamped onto the message hash.
    await db.outreachMessage.update({
      where: { id: messageId },
      data: { unsubscribeTokenHash: sha256(otherToken) },
    });

    const result = await unsubscribeWithToken(otherToken);
    expect(result).toMatchObject({ ok: false });
    expect((await getUnsubscribePreview(otherToken)).ok).toBe(false);
  });

  it("rejects a token for a message that has not been sent", async () => {
    const fixture = await draftFixture();
    const email = normalizeEmail(fixture.lead.contactEmail!);
    const token = createUnsubscribeToken({
      v: 1,
      workspaceId: tenant.workspace.id,
      messageId: fixture.messageId,
      email,
    });

    expect((await getUnsubscribePreview(token)).ok).toBe(false);
    expect(await unsubscribeWithToken(token)).toMatchObject({ ok: false });
  });
});
