import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTempDatabase, createTestTenant } from "@/test/temp-db";

// Nothing here touches a provider or sends email. The database is a throwaway
// SQLite file pushed from the real schema, so constraints and transactions are real.
const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;
process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-bytes-long";
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const { db } = await import("@/lib/db");
const { getFeatureFlags, isFeatureEnabled } = await import("@/lib/features");
const {
  assignWorkspacePlan,
  getAdminWorkspacesPage,
  searchAuditLogs,
  updateFeatureFlags,
} = await import("@/server/services/admin");
const { signUp } = await import("@/server/services/auth");

type Tenant = Awaited<ReturnType<typeof createTestTenant>>;

let tenantA: Tenant;
let tenantB: Tenant;
let paidPlan: { id: string; name: string };

beforeAll(async () => {
  await db.plan.create({
    data: {
      key: "free",
      name: "Free",
      description: "Free plan for signup",
      monthlyPrice: 0,
      yearlyPrice: 0,
    },
  });

  tenantA = await createTestTenant(db, { key: "admin-a" });
  tenantB = await createTestTenant(db, { key: "admin-b" });

  paidPlan = await db.plan.create({
    data: {
      key: `professional-${Date.now()}`,
      name: "Professional",
      description: "Paid plan",
      monthlyPrice: 7_900,
      yearlyPrice: 79_000,
    },
  });
});

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

describe("platform feature flags", () => {
  it("defaults every flag to enabled when no setting exists", async () => {
    const flags = await getFeatureFlags();

    expect(flags).toEqual({ signups: true, csv_import: true, outreach_sending: true });
    expect(await isFeatureEnabled("signups")).toBe(true);
  });

  it("stores toggles, reports changes, and audits them once", async () => {
    const first = await updateFeatureFlags({
      flags: { signups: false, csv_import: true, outreach_sending: false },
      actorId: tenantA.user.id,
    });

    expect(first).toEqual({ ok: true, changed: ["signups", "outreach_sending"] });
    expect(await isFeatureEnabled("signups")).toBe(false);
    expect(await isFeatureEnabled("outreach_sending")).toBe(false);

    const stored = await db.setting.findMany({ where: { key: { startsWith: "feature." } } });
    expect(
      stored.map((row) => [row.key, row.value]).sort((a, b) => a[0].localeCompare(b[0])),
    ).toEqual([
      ["feature.outreach_sending", "false"],
      ["feature.signups", "false"],
    ]);

    const audit = await db.auditLog.findFirst({
      where: { action: "platform.feature_flags_updated" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.actorId).toBe(tenantA.user.id);
    expect(audit?.metadata).toContain('"signups":true');
    expect(audit?.metadata).toContain('"signups":false');

    const again = await updateFeatureFlags({
      flags: { signups: false, csv_import: true, outreach_sending: false },
      actorId: tenantA.user.id,
    });
    expect(again).toEqual({ ok: true, changed: [] });
    expect(
      await db.auditLog.count({ where: { action: "platform.feature_flags_updated" } }),
    ).toBe(1);
  });

  it("rejects an empty or unknown flag payload", async () => {
    const result = await updateFeatureFlags({
      flags: { unknown: false } as never,
      actorId: tenantA.user.id,
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("blocks signup while the signups flag is off", async () => {
    const blocked = await signUp({
      name: "Blocked User",
      email: "blocked@example.test",
      companyName: "Blocked Co",
      password: "CorrectHorseBattery1!",
    });
    expect(blocked).toMatchObject({ ok: false, code: "CONFIG" });
    expect(await db.user.count({ where: { email: "blocked@example.test" } })).toBe(0);

    await db.setting.upsert({
      where: { key: "feature.signups" },
      update: { value: "true" },
      create: { key: "feature.signups", value: "true" },
    });

    const allowed = await signUp({
      name: "Allowed User",
      email: "allowed@example.test",
      companyName: "Allowed Co",
      password: "CorrectHorseBattery1!",
    });
    expect(allowed.ok).toBe(true);
  });
});

describe("admin workspace page", () => {
  it("lists workspaces with owner, plan, and counts", async () => {
    const page = await getAdminWorkspacesPage({ page: 1 });

    expect(page.total).toBeGreaterThanOrEqual(3);
    const row = page.workspaces.find((workspace) => workspace.id === tenantA.workspace.id);
    expect(row?.owner.email).toBe(tenantA.user.email);
    expect(row?.subscription?.plan.id).toBe(tenantA.plan.id);
    expect(row?._count.memberships).toBe(1);
  });

  it("searches by workspace name and owner email", async () => {
    const byName = await getAdminWorkspacesPage({ q: "Test workspace" });
    const names = byName.workspaces.map((workspace) => workspace.id);
    expect(names).toContain(tenantA.workspace.id);
    expect(names).toContain(tenantB.workspace.id);

    const byOwner = await getAdminWorkspacesPage({ q: tenantB.user.email });
    expect(byOwner.workspaces.map((workspace) => workspace.id)).toEqual([tenantB.workspace.id]);
  });

  it("paginates without dropping rows", async () => {
    const first = await getAdminWorkspacesPage({ page: 1, pageSize: 1 });
    const second = await getAdminWorkspacesPage({ page: 2, pageSize: 1 });

    expect(first.workspaces).toHaveLength(1);
    expect(second.workspaces).toHaveLength(1);
    expect(first.workspaces[0].id).not.toBe(second.workspaces[0].id);
    expect(first.pageCount).toBe(first.total);
  });
});

describe("manual plan assignment", () => {
  it("assigns an internal plan and audits previous and next", async () => {
    const result = await assignWorkspacePlan({
      workspaceId: tenantA.workspace.id,
      planId: paidPlan.id,
      actorId: tenantA.user.id,
    });

    expect(result).toEqual({ ok: true, changed: true });
    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenantA.workspace.id },
    });
    expect(subscription).toMatchObject({
      planId: paidPlan.id,
      provider: "internal",
      providerSubscriptionId: null,
      interval: null,
      status: "ACTIVE",
    });

    const audit = await db.auditLog.findFirst({
      where: { action: "workspace.plan_assigned", workspaceId: tenantA.workspace.id },
    });
    expect(audit?.metadata).toContain(paidPlan.id);
    expect(audit?.metadata).toContain(tenantA.plan.id);
  });

  it("is a no-op when the workspace already has that internal plan", async () => {
    const again = await assignWorkspacePlan({
      workspaceId: tenantA.workspace.id,
      planId: paidPlan.id,
      actorId: tenantA.user.id,
    });

    expect(again).toEqual({ ok: true, changed: false });
    expect(
      await db.auditLog.count({
        where: { action: "workspace.plan_assigned", workspaceId: tenantA.workspace.id },
      }),
    ).toBe(1);
  });

  it("refuses to override a live Razorpay subscription", async () => {
    const tenant = await createTestTenant(db, { key: "admin-provider" });
    await db.subscription.update({
      where: { workspaceId: tenant.workspace.id },
      data: {
        provider: "razorpay",
        providerSubscriptionId: "sub_live_001",
        providerCustomerId: "cust_live_001",
        status: "ACTIVE",
        interval: "MONTHLY",
      },
    });

    const result = await assignWorkspacePlan({
      workspaceId: tenant.workspace.id,
      planId: paidPlan.id,
      actorId: tenant.user.id,
    });

    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenant.workspace.id },
    });
    expect(subscription?.planId).toBe(tenant.plan.id);
    expect(subscription?.providerSubscriptionId).toBe("sub_live_001");
  });

  it("allows assignment after the provider subscription is canceled", async () => {
    const tenant = await createTestTenant(db, { key: "admin-canceled" });
    await db.subscription.update({
      where: { workspaceId: tenant.workspace.id },
      data: {
        provider: "razorpay",
        providerSubscriptionId: "sub_canceled_001",
        status: "CANCELED",
        interval: null,
      },
    });

    const result = await assignWorkspacePlan({
      workspaceId: tenant.workspace.id,
      planId: paidPlan.id,
      actorId: tenant.user.id,
    });

    expect(result).toEqual({ ok: true, changed: true });
    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenant.workspace.id },
    });
    expect(subscription?.planId).toBe(paidPlan.id);
    expect(subscription?.providerSubscriptionId).toBeNull();
  });

  it("rejects an unknown workspace or inactive plan", async () => {
    const missing = await assignWorkspacePlan({
      workspaceId: "does-not-exist",
      planId: paidPlan.id,
      actorId: tenantA.user.id,
    });
    expect(missing).toMatchObject({ ok: false, code: "NOT_FOUND" });

    const inactive = await db.plan.create({
      data: {
        key: `inactive-${Date.now()}`,
        name: "Inactive",
        description: "Hidden plan",
        isActive: false,
      },
    });
    const rejected = await assignWorkspacePlan({
      workspaceId: tenantB.workspace.id,
      planId: inactive.id,
      actorId: tenantB.user.id,
    });
    expect(rejected).toMatchObject({ ok: false, code: "INVALID" });
  });
});

describe("audit search", () => {
  it("searches by keyword across action, actor, workspace, and metadata", async () => {
    const byKeyword = await searchAuditLogs({ q: "feature_flags" });
    expect(byKeyword.total).toBeGreaterThanOrEqual(1);
    expect(byKeyword.entries[0].action).toBe("platform.feature_flags_updated");

    const byActor = await searchAuditLogs({ q: tenantA.user.email });
    expect(byActor.total).toBeGreaterThanOrEqual(1);

    const byMetadata = await searchAuditLogs({ q: paidPlan.id });
    expect(byMetadata.total).toBeGreaterThanOrEqual(1);
  });

  it("filters by workspace, action prefix, and date range", async () => {
    const byWorkspace = await searchAuditLogs({ workspaceId: tenantA.workspace.id });
    expect(byWorkspace.entries.every((entry) => entry.workspaceId === tenantA.workspace.id)).toBe(
      true,
    );

    const byAction = await searchAuditLogs({ action: "workspace.plan" });
    expect(byAction.total).toBeGreaterThanOrEqual(1);
    expect(byAction.entries.every((entry) => entry.action.includes("workspace.plan"))).toBe(true);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const future = await searchAuditLogs({ from: tomorrow });
    expect(future.total).toBe(0);

    const past = await searchAuditLogs({ to: new Date(Date.now() - 24 * 60 * 60 * 1000) });
    expect(past.total).toBe(0);
  });

  it("paginates audit results newest first", async () => {
    const first = await searchAuditLogs({ page: 1, pageSize: 2 });
    const second = await searchAuditLogs({ page: 2, pageSize: 2 });

    expect(first.entries).toHaveLength(2);
    expect(second.entries).toHaveLength(2);
    expect(first.entries[0].createdAt.getTime()).toBeGreaterThanOrEqual(
      first.entries[1].createdAt.getTime(),
    );
    expect(first.entries.map((entry) => entry.id)).not.toContain(second.entries[0].id);
    expect(first.pageCount).toBe(Math.ceil(first.total / 2));
  });
});
