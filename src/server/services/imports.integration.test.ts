import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTempDatabase, createTestTenant } from "@/test/temp-db";

// The Prisma client reads DATABASE_URL when it is constructed, so the throwaway
// database must exist before any module that imports `@/lib/db` is loaded.
const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;

const { db } = await import("@/lib/db");
const { importLeadsCsv } = await import("@/server/services/imports");

const MAPPING = {
  companyName: 0,
  contactEmail: 1,
  website: 2,
  industry: 3,
  sourceUrl: 4,
};

const CSV = [
  "Company Name,Contact Email,Website,Industry,Evidence URL",
  "Acme,hi@acme.test,acme.test,SaaS,https://evidence.test/acme",
  "Beta,hi@beta.test,beta.test,Fintech,",
  "Acme duplicate,HI@acme.test,acme.test,SaaS,",
  "Gamma,not-an-email,,,,",
].join("\n");

let tenant: Awaited<ReturnType<typeof createTestTenant>>;

async function leadUsage(workspaceId: string): Promise<number> {
  const counter = await db.usageCounter.findFirst({
    where: { workspaceId, metric: "leads_per_month" },
  });
  return counter?.used ?? 0;
}

beforeAll(async () => {
  tenant = await createTestTenant(db, { key: "import" });
});

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

describe("CSV import", () => {
  it("refuses imports while the platform switch is off without touching leads", async () => {
    const target = await createTestTenant(db, { key: "import-disabled" });
    await db.setting.upsert({
      where: { key: "feature.csv_import" },
      update: { value: "false" },
      create: { key: "feature.csv_import", value: "false" },
    });

    try {
      const result = await importLeadsCsv({
        workspaceId: target.workspace.id,
        userId: target.user.id,
        filename: "leads.csv",
        content: CSV,
        mapping: MAPPING,
        rightsConfirmed: true,
      });

      expect(result).toMatchObject({ ok: false, code: "DISABLED" });
      expect(await db.lead.count({ where: { workspaceId: target.workspace.id } })).toBe(0);
      expect(await db.leadImport.count({ where: { workspaceId: target.workspace.id } })).toBe(0);
      expect(await leadUsage(target.workspace.id)).toBe(0);
    } finally {
      await db.setting.deleteMany({ where: { key: "feature.csv_import" } });
    }
  });

  it("stores valid rows, reports duplicates and invalid rows, and reserves usage", async () => {
    const result = await importLeadsCsv({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      filename: "leads.csv",
      content: CSV,
      mapping: MAPPING,
      rightsConfirmed: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.importedCount).toBe(2);
    expect(result.duplicateCount).toBe(1);
    expect(result.invalidCount).toBe(1);

    const leads = await db.lead.findMany({
      where: { workspaceId: tenant.workspace.id },
      orderBy: { companyName: "asc" },
    });
    expect(leads.map((lead) => lead.companyName)).toEqual(["Acme", "Beta"]);
    expect(leads.map((lead) => lead.dedupeKey)).toEqual([
      "email:hi@acme.test",
      "email:hi@beta.test",
    ]);

    const acme = leads[0]!;
    expect(acme.verificationStatus).toBe("PARTIAL");
    expect(acme.sourceId).not.toBeNull();
    expect(acme.sourceUrl).toBe("https://evidence.test/acme");
    expect(leads[1]!.verificationStatus).toBe("UNVERIFIED");

    const verifications = await db.leadFieldVerification.findMany({
      where: { leadId: acme.id },
    });
    expect(verifications).toHaveLength(1);
    expect(verifications[0]!.sourceUrl).toBe("https://evidence.test/acme");

    const activities = await db.leadActivity.findMany({
      where: { lead: { workspaceId: tenant.workspace.id }, type: "IMPORTED" },
    });
    expect(activities).toHaveLength(2);

    expect(await leadUsage(tenant.workspace.id)).toBe(2);

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "leads.imported" },
    });
    expect(audit).not.toBeNull();
  });

  it("re-importing the same file adds nothing and releases no capacity", async () => {
    const before = await leadUsage(tenant.workspace.id);
    const result = await importLeadsCsv({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      filename: "leads.csv",
      content: CSV,
      mapping: MAPPING,
      rightsConfirmed: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.importedCount).toBe(0);
    expect(result.duplicateCount).toBe(3);
    expect(result.invalidCount).toBe(1);

    expect(await db.lead.count({ where: { workspaceId: tenant.workspace.id } })).toBe(2);
    expect(await leadUsage(tenant.workspace.id)).toBe(before);

    const records = await db.leadImport.findMany({
      where: { workspaceId: tenant.workspace.id },
      orderBy: { createdAt: "asc" },
    });
    expect(records).toHaveLength(2);
    expect(records[1]!.importedCount).toBe(0);
    expect(records[1]!.duplicateCount).toBe(3);
  });

  it("keeps dedupe scoped to the workspace", async () => {
    const other = await createTestTenant(db, { key: "import-other", leadLimit: 50 });
    const result = await importLeadsCsv({
      workspaceId: other.workspace.id,
      userId: other.user.id,
      filename: "leads.csv",
      content: CSV,
      mapping: MAPPING,
      rightsConfirmed: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.importedCount).toBe(2);
    expect(await db.lead.count({ where: { workspaceId: other.workspace.id } })).toBe(2);
  });

  it("rejects an import that would exceed the monthly lead limit without partial writes", async () => {
    const capped = await createTestTenant(db, { key: "import-capped", leadLimit: 1 });
    const result = await importLeadsCsv({
      workspaceId: capped.workspace.id,
      userId: capped.user.id,
      filename: "leads.csv",
      content: CSV,
      mapping: MAPPING,
      rightsConfirmed: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("LIMIT_REACHED");

    expect(await db.lead.count({ where: { workspaceId: capped.workspace.id } })).toBe(0);
    expect(await db.leadImport.count({ where: { workspaceId: capped.workspace.id } })).toBe(0);
    expect(await leadUsage(capped.workspace.id)).toBe(0);
  });

  it("refuses imports without a rights confirmation or a usable mapping", async () => {
    const noRights = await importLeadsCsv({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      filename: "leads.csv",
      content: CSV,
      mapping: MAPPING,
      rightsConfirmed: false,
    });
    expect(noRights.ok).toBe(false);
    if (noRights.ok) return;
    expect(noRights.code).toBe("INVALID");

    const noMapping = await importLeadsCsv({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      filename: "leads.csv",
      content: CSV,
      mapping: { contactEmail: 1 },
      rightsConfirmed: true,
    });
    expect(noMapping.ok).toBe(false);
    if (noMapping.ok) return;
    expect(noMapping.code).toBe("MAPPING");
  });

  it("rejects a file where every row is invalid without creating an import record", async () => {
    const result = await importLeadsCsv({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      filename: "bad.csv",
      content: "Company Name\n\n",
      mapping: { companyName: 0 },
      rightsConfirmed: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("EMPTY");
    expect(await db.leadImport.count({ where: { workspaceId: tenant.workspace.id } })).toBe(2);
  });
});
