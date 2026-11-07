import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTempDatabase, createTestTenant } from "@/test/temp-db";

const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;
process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-bytes-long";

const { db } = await import("@/lib/db");
const { setLeadFieldVerification, VERIFIABLE_FIELDS } = await import(
  "@/server/services/verification"
);

type Tenant = Awaited<ReturnType<typeof createTestTenant>>;

let tenant: Tenant;

beforeAll(async () => {
  tenant = await createTestTenant(db, { key: "verification" });
});

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

async function fixtureLead() {
  return db.lead.create({
    data: {
      workspaceId: tenant.workspace.id,
      companyName: "Acme Logistics",
      contactEmail: "dana@acme.test",
      industry: "Logistics",
      location: "Austin, TX",
    },
  });
}

function check(
  leadId: string,
  field: string,
  status: string,
  extra: { sourceUrl?: string | null; note?: string | null } = {},
) {
  return setLeadFieldVerification({
    workspaceId: tenant.workspace.id,
    actorId: tenant.user.id,
    leadId,
    field,
    status,
    ...extra,
  });
}

describe("field verification", () => {
  it("derives overall verification only from populated, human-checked fields", async () => {
    const lead = await fixtureLead();

    const first = await check(lead.id, "companyName", "VERIFIED", {
      sourceUrl: "https://acme.test/about",
      note: "Matched the company name on the official site.",
    });
    expect(first).toEqual({ ok: true, overallStatus: "PARTIAL" });

    // Website, contact name, and phone are blank, so they must not block a
    // verified result once every populated field has been checked.
    const remaining = [
      ["contactEmail", "https://acme.test/team"],
      ["industry", "https://acme.test/about"],
      ["location", "https://acme.test/contact"],
    ] as const;
    for (const [field, sourceUrl] of remaining) {
      const result = await check(lead.id, field, "VERIFIED", { sourceUrl });
      expect(result.ok).toBe(true);
    }

    const stored = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(stored.verificationStatus).toBe("VERIFIED");

    const rows = await db.leadFieldVerification.findMany({ where: { leadId: lead.id } });
    expect(rows).toHaveLength(remaining.length + 1);
    expect(rows.every((row) => row.status === "VERIFIED")).toBe(true);
    expect(rows.find((row) => row.field === "companyName")?.sourceUrl).toBe(
      "https://acme.test/about",
    );

    const activities = await db.leadActivity.count({
      where: { leadId: lead.id, type: "FIELD_VERIFIED" },
    });
    expect(activities).toBe(4);

    const audits = await db.auditLog.findMany({
      where: {
        workspaceId: tenant.workspace.id,
        action: "lead.field_verified",
        entityId: lead.id,
      },
    });
    expect(audits).toHaveLength(4);
    expect(
      audits.some((audit) => JSON.parse(audit.metadata ?? "{}").field === "location"),
    ).toBe(true);
  });

  it("updates an existing check instead of duplicating it", async () => {
    const lead = await fixtureLead();

    await check(lead.id, "companyName", "VERIFIED", {
      sourceUrl: "https://acme.test/about",
      note: "Initial check.",
    });
    const updated = await check(lead.id, "companyName", "UNVERIFIED", {
      note: "The live site no longer lists this name.",
    });
    expect(updated).toEqual({ ok: true, overallStatus: "UNVERIFIED" });

    const rows = await db.leadFieldVerification.findMany({
      where: { leadId: lead.id, field: "companyName" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("UNVERIFIED");
    expect(rows[0]!.sourceUrl).toBeNull();
    expect(rows[0]!.note).toBe("The live site no longer lists this name.");
  });

  it("rejects unknown fields, statuses, and unsafe evidence URLs", async () => {
    const lead = await fixtureLead();

    expect(await check(lead.id, "password", "VERIFIED")).toMatchObject({
      ok: false,
      code: "INVALID",
    });
    expect(await check(lead.id, "companyName", "MAYBE")).toMatchObject({
      ok: false,
      code: "INVALID",
    });
    expect(
      await check(lead.id, "companyName", "VERIFIED", {
        sourceUrl: "javascript:alert(1)",
      }),
    ).toMatchObject({ ok: false, code: "INVALID" });
    expect(
      await check(lead.id, "companyName", "VERIFIED", {
        sourceUrl: "not a url",
      }),
    ).toMatchObject({ ok: false, code: "INVALID" });

    expect(await db.leadFieldVerification.count({ where: { leadId: lead.id } })).toBe(0);
  });

  it("refuses to verify a lead outside the workspace", async () => {
    const other = await createTestTenant(db, { key: "verification-other" });
    const lead = await fixtureLead();

    const result = await setLeadFieldVerification({
      workspaceId: other.workspace.id,
      actorId: other.user.id,
      leadId: lead.id,
      field: "companyName",
      status: "VERIFIED",
    });
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await db.leadFieldVerification.count({ where: { leadId: lead.id } })).toBe(0);
  });

  it("keeps the verifiable field list stable", () => {
    expect(VERIFIABLE_FIELDS).toContain("contactEmail");
    expect(VERIFIABLE_FIELDS).not.toContain("score");
  });
});
