import { afterAll, describe, expect, it } from "vitest";

import { createTempDatabase, createTestTenant } from "@/test/temp-db";

// The compliance service reads the Prisma client at import time, so the
// throwaway database URL must be set before any application module is loaded.
const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;
process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-bytes-long";
process.env.APP_URL = "http://localhost:3000";

const { db } = await import("@/lib/db");
const { hashPassword } = await import("@/lib/auth/password");
const {
  exportWorkspaceData,
  getComplianceState,
  requestWorkspaceDeletion,
  runRetentionCleanup,
  updateComplianceSettings,
} = await import("@/server/services/compliance");

type Tenant = Awaited<ReturnType<typeof createTestTenant>>;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * DAY_MS);
}

async function createLead(
  tenant: Tenant,
  input: {
    companyName: string;
    updatedAt?: Date;
    deletedAt?: Date | null;
  },
) {
  const lead = await db.lead.create({
    data: {
      workspaceId: tenant.workspace.id,
      companyName: input.companyName,
      contactEmail: `${input.companyName.toLowerCase().replaceAll(" ", "-")}@example.test`,
      deletedAt: input.deletedAt ?? null,
    },
  });
  if (input.updatedAt) {
    await db.lead.update({
      where: { id: lead.id },
      data: { updatedAt: input.updatedAt, createdAt: input.updatedAt },
    });
  }
  return lead;
}

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

describe("compliance settings", () => {
  it("validates retention and approval policy, persists valid values, and audits the change", async () => {
    const tenant = await createTestTenant(db, { key: "compliance-settings" });

    const invalidRetention = await updateComplianceSettings({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      retentionDays: "45",
      approvalPolicy: "ADMIN_OR_OWNER",
    });
    expect(invalidRetention).toMatchObject({ ok: false, code: "INVALID" });

    const invalidPolicy = await updateComplianceSettings({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      retentionDays: "90",
      approvalPolicy: "ANYONE",
    });
    expect(invalidPolicy).toMatchObject({ ok: false, code: "INVALID" });

    const saved = await updateComplianceSettings({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      retentionDays: "90",
      approvalPolicy: "OWNER_ONLY",
    });
    expect(saved).toEqual({ ok: true });

    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: tenant.workspace.id },
    });
    expect(workspace.leadRetentionDays).toBe(90);
    expect(workspace.approvalPolicy).toBe("OWNER_ONLY");

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "workspace.compliance_updated" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit?.metadata ?? "{}")).toMatchObject({
      previous: { leadRetentionDays: null, approvalPolicy: "ADMIN_OR_OWNER" },
      next: { leadRetentionDays: 90, approvalPolicy: "OWNER_ONLY" },
    });

    const state = await getComplianceState(tenant.workspace.id);
    expect(state).toMatchObject({
      leadRetentionDays: 90,
      approvalPolicy: "OWNER_ONLY",
      activeLeads: 0,
      softDeletedLeads: 0,
      oldestLeadAt: null,
    });
  });

  it("does not write an audit entry when the value is unchanged", async () => {
    const tenant = await createTestTenant(db, { key: "compliance-noop" });
    await updateComplianceSettings({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      retentionDays: "30",
      approvalPolicy: "ADMIN_OR_OWNER",
    });
    await updateComplianceSettings({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      retentionDays: "30",
      approvalPolicy: "ADMIN_OR_OWNER",
    });

    const audits = await db.auditLog.count({
      where: { workspaceId: tenant.workspace.id, action: "workspace.compliance_updated" },
    });
    expect(audits).toBe(1);
  });

  it("treats 'keep' as no retention window", async () => {
    const tenant = await createTestTenant(db, { key: "compliance-keep" });
    await db.workspace.update({
      where: { id: tenant.workspace.id },
      data: { leadRetentionDays: 30 },
    });

    const saved = await updateComplianceSettings({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      retentionDays: "keep",
      approvalPolicy: "ADMIN_OR_OWNER",
    });
    expect(saved).toEqual({ ok: true });

    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: tenant.workspace.id },
    });
    expect(workspace.leadRetentionDays).toBeNull();
  });
});

describe("retention cleanup", () => {
  it("soft-deletes leads past the retention window and leaves recent leads alone", async () => {
    const tenant = await createTestTenant(db, { key: "retention-soft-delete" });
    await db.workspace.update({
      where: { id: tenant.workspace.id },
      data: { leadRetentionDays: 30 },
    });

    const stale = await createLead(tenant, {
      companyName: "Stale Co",
      updatedAt: daysAgo(45),
    });
    const fresh = await createLead(tenant, {
      companyName: "Fresh Co",
      updatedAt: daysAgo(5),
    });

    const now = new Date();
    const result = await runRetentionCleanup({ workspaceId: tenant.workspace.id, now });

    expect(result.ok).toBe(true);
    expect(result.leadsSoftDeleted).toBe(1);
    expect(result.leadsPurged).toBe(0);

    const staleRow = await db.lead.findUniqueOrThrow({ where: { id: stale.id } });
    const freshRow = await db.lead.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(staleRow.deletedAt).toEqual(now);
    expect(freshRow.deletedAt).toBeNull();

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "workspace.retention_run" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit?.metadata ?? "{}")).toMatchObject({ leadsSoftDeleted: 1 });
  });

  it("permanently purges soft-deleted leads after the grace period", async () => {
    const tenant = await createTestTenant(db, { key: "retention-purge" });
    const expired = await createLead(tenant, {
      companyName: "Expired Co",
      updatedAt: daysAgo(60),
      deletedAt: daysAgo(40),
    });
    const withinGrace = await createLead(tenant, {
      companyName: "Grace Co",
      updatedAt: daysAgo(10),
      deletedAt: daysAgo(3),
    });

    const result = await runRetentionCleanup({
      workspaceId: tenant.workspace.id,
      now: new Date(),
    });

    expect(result.leadsPurged).toBe(1);
    expect(await db.lead.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await db.lead.findUnique({ where: { id: withinGrace.id } })).not.toBeNull();
  });

  it("never soft-deletes or purges an active workspace with no retention window", async () => {
    const tenant = await createTestTenant(db, { key: "retention-none" });
    const lead = await createLead(tenant, {
      companyName: "Kept Co",
      updatedAt: daysAgo(400),
    });

    await runRetentionCleanup({ workspaceId: tenant.workspace.id });

    expect(await db.lead.findUnique({ where: { id: lead.id } })).not.toBeNull();
    expect(
      await db.workspace.findUnique({ where: { id: tenant.workspace.id } }),
    ).not.toBeNull();
  });

  it("audits a manual run even when the cleanup changes nothing", async () => {
    const tenant = await createTestTenant(db, { key: "retention-noop-audit" });

    const result = await runRetentionCleanup({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
    });
    expect(result).toMatchObject({
      leadsSoftDeleted: 0,
      leadsPurged: 0,
      workspacesPurged: 0,
    });

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "workspace.retention_run" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit?.metadata ?? "{}")).toMatchObject({
      leadsSoftDeleted: 0,
      leadsPurged: 0,
    });
  });

  it("purges a workspace only after the full grace period", async () => {
    const expiredTenant = await createTestTenant(db, { key: "workspace-purge-expired" });
    const recentTenant = await createTestTenant(db, { key: "workspace-purge-recent" });
    await db.workspace.update({
      where: { id: expiredTenant.workspace.id },
      data: { deletedAt: daysAgo(40) },
    });
    await db.workspace.update({
      where: { id: recentTenant.workspace.id },
      data: { deletedAt: daysAgo(2) },
    });

    const result = await runRetentionCleanup();

    expect(result.workspacesPurged).toBeGreaterThanOrEqual(1);
    expect(
      await db.workspace.findUnique({ where: { id: expiredTenant.workspace.id } }),
    ).toBeNull();
    expect(
      await db.workspace.findUnique({ where: { id: recentTenant.workspace.id } }),
    ).not.toBeNull();

    // The purge record survives the workspace row (the relation is SetNull).
    const purgeAudit = await db.auditLog.findFirst({
      where: {
        action: "workspace.purged",
        entityId: expiredTenant.workspace.id,
      },
    });
    expect(purgeAudit).not.toBeNull();
    expect(purgeAudit?.workspaceId).toBeNull();
  });
});

describe("workspace export", () => {
  it("returns a versioned bundle without soft-deleted leads and audits the export", async () => {
    const tenant = await createTestTenant(db, { key: "export" });
    const activeLead = await createLead(tenant, { companyName: "Active Co" });
    await createLead(tenant, {
      companyName: "Deleted Co",
      updatedAt: daysAgo(5),
      deletedAt: daysAgo(1),
    });
    await db.suppressionEntry.create({
      data: {
        workspaceId: tenant.workspace.id,
        email: "opt-out@example.test",
        normalizedEmail: "opt-out@example.test",
        reason: "MANUAL",
      },
    });
    const campaign = await db.campaign.create({
      data: {
        workspaceId: tenant.workspace.id,
        name: "Export campaign",
        createdById: tenant.user.id,
      },
    });

    const bundle = await exportWorkspaceData({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
    });
    expect(bundle).not.toBeNull();
    expect(bundle?.formatVersion).toBe(1);
    expect(bundle?.workspace).toMatchObject({
      id: tenant.workspace.id,
      leadRetentionDays: null,
      approvalPolicy: "ADMIN_OR_OWNER",
    });
    expect(bundle?.leads.map((lead) => lead.id)).toEqual([activeLead.id]);
    expect(bundle?.campaigns.map((row) => row.id)).toEqual([campaign.id]);
    expect(bundle?.suppressionEntries).toHaveLength(1);
    expect(bundle?.members[0]).toMatchObject({ role: "OWNER" });

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "workspace.data_exported" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit?.metadata ?? "{}").formatVersion).toBe(1);
  });

  it("returns null for a deleted workspace", async () => {
    const tenant = await createTestTenant(db, { key: "export-deleted" });
    await db.workspace.update({
      where: { id: tenant.workspace.id },
      data: { deletedAt: new Date() },
    });

    expect(
      await exportWorkspaceData({
        workspaceId: tenant.workspace.id,
        actorId: tenant.user.id,
      }),
    ).toBeNull();
  });
});

describe("workspace deletion", () => {
  const password = "CorrectHorse9!";

  async function tenantWithPassword(key: string) {
    const tenant = await createTestTenant(db, { key });
    await db.user.update({
      where: { id: tenant.user.id },
      data: { passwordHash: await hashPassword(password) },
    });
    return tenant;
  }

  it("requires the exact workspace name and the current password", async () => {
    const tenant = await tenantWithPassword("delete-validation");

    const wrongName = await requestWorkspaceDeletion({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      confirmation: "Not the workspace",
      password,
    });
    expect(wrongName).toMatchObject({ ok: false, code: "INVALID" });

    const wrongPassword = await requestWorkspaceDeletion({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      confirmation: tenant.workspace.name,
      password: "WrongPassword9!",
    });
    expect(wrongPassword).toMatchObject({ ok: false, code: "INVALID" });

    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: tenant.workspace.id },
    });
    expect(workspace.deletedAt).toBeNull();
  });

  it("refuses deletion while a live Razorpay subscription is attached", async () => {
    const tenant = await tenantWithPassword("delete-live-subscription");
    await db.subscription.update({
      where: { workspaceId: tenant.workspace.id },
      data: {
        provider: "razorpay",
        providerSubscriptionId: "sub_live_123",
        status: "ACTIVE",
      },
    });

    const result = await requestWorkspaceDeletion({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      confirmation: tenant.workspace.name,
      password,
    });
    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(
      (await db.workspace.findUniqueOrThrow({ where: { id: tenant.workspace.id } })).deletedAt,
    ).toBeNull();
  });

  it("soft-deletes the workspace, revokes access, and records the purge deadline", async () => {
    const tenant = await tenantWithPassword("delete-success");
    await db.subscription.update({
      where: { workspaceId: tenant.workspace.id },
      data: {
        provider: "razorpay",
        providerSubscriptionId: "sub_canceled_123",
        status: "CANCELED",
      },
    });
    await db.invite.create({
      data: {
        workspaceId: tenant.workspace.id,
        email: "pending@example.test",
        role: "MEMBER",
        tokenHash: `token-${tenant.workspace.id}`,
        invitedById: tenant.user.id,
        expiresAt: new Date(Date.now() + DAY_MS),
      },
    });

    const result = await requestWorkspaceDeletion({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      confirmation: tenant.workspace.name,
      password,
    });
    expect(result).toEqual({ ok: true });

    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: tenant.workspace.id },
    });
    expect(workspace.deletedAt).not.toBeNull();
    expect(
      await db.invite.count({ where: { workspaceId: tenant.workspace.id } }),
    ).toBe(0);

    const audit = await db.auditLog.findFirst({
      where: {
        workspaceId: tenant.workspace.id,
        action: "workspace.deletion_requested",
      },
    });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit?.metadata ?? "{}").purgeAfterDays).toBe(30);
  });
});
