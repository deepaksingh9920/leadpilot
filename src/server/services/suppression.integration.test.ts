import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTempDatabase, createTestTenant } from "@/test/temp-db";

const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;

const { db } = await import("@/lib/db");
const {
  addSuppression,
  countSuppressions,
  getSuppressedEmails,
  importSuppressionsCsv,
  isSuppressed,
  listSuppressions,
  removeSuppression,
} = await import("@/server/services/suppression");

let tenant: Awaited<ReturnType<typeof createTestTenant>>;

beforeAll(async () => {
  tenant = await createTestTenant(db, { key: "suppression" });
});

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

describe("suppression service", () => {
  it("normalizes and rejects invalid addresses", async () => {
    const invalid = await addSuppression({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      email: "not-an-email",
      reason: "MANUAL",
    });
    expect(invalid).toMatchObject({ ok: false, code: "INVALID" });

    const added = await addSuppression({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      email: " Dana@Acme.TEST ",
      reason: "UNSUBSCRIBED",
      source: "Manual test",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.entry.email).toBe("Dana@Acme.TEST");

    expect(await isSuppressed(tenant.workspace.id, "dana@acme.test")).toBe(true);
    expect(await countSuppressions(tenant.workspace.id)).toBe(1);

    const duplicate = await addSuppression({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      email: "dana@acme.test",
      reason: "MANUAL",
    });
    expect(duplicate).toMatchObject({ ok: false, code: "DUPLICATE" });

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "suppression.added" },
    });
    expect(audit).not.toBeNull();
  });

  it("imports a CSV with duplicates, invalid rows, and an optional reason", async () => {
    const result = await importSuppressionsCsv({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      filename: "suppressions.csv",
      content: [
        "Email,Reason",
        "unsub1@example.test,UNSUBSCRIBED",
        "UNSUB1@example.test,MANUAL",
        "bounce@example.test,BOUNCED",
        "not-an-email,MANUAL",
        "manual@example.test,",
      ].join("\n"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.total).toBe(5);
    expect(result.added).toBe(3);
    expect(result.invalid).toBe(1);

    const entries = await listSuppressions(tenant.workspace.id);
    expect(entries.map((entry) => entry.email).sort()).toEqual([
      "Dana@Acme.TEST",
      "bounce@example.test",
      "manual@example.test",
      "unsub1@example.test",
    ]);

    const bounce = entries.find((entry) => entry.email === "bounce@example.test");
    expect(bounce?.reason).toBe("BOUNCED");
    expect(bounce?.source).toContain("suppressions.csv");

    const repeat = await importSuppressionsCsv({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      content: "Email\nunsub1@example.test\nbounce@example.test\n",
    });
    expect(repeat.ok).toBe(true);
    if (!repeat.ok) return;
    expect(repeat.added).toBe(0);
    expect(repeat.duplicates).toBe(2);
  });

  it("accepts a one-column list without a header", async () => {
    const result = await importSuppressionsCsv({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      content: "one@example.test\ntwo@example.test\n",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.added).toBe(2);
    expect(await isSuppressed(tenant.workspace.id, "two@example.test")).toBe(true);
  });

  it("returns the normalized subset that is suppressed", async () => {
    const found = await getSuppressedEmails(tenant.workspace.id, [
      "ONE@example.test",
      "missing@example.test",
      "not-an-email",
    ]);
    expect([...found]).toEqual(["one@example.test"]);
  });

  it("removes an entry and audits it", async () => {
    const entries = await listSuppressions(tenant.workspace.id);
    const target = entries.find((entry) => entry.email === "manual@example.test");
    expect(target).toBeTruthy();

    const removed = await removeSuppression({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      entryId: target!.id,
    });
    expect(removed.ok).toBe(true);
    expect(await isSuppressed(tenant.workspace.id, "manual@example.test")).toBe(false);

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "suppression.removed" },
    });
    expect(audit).not.toBeNull();

    const missing = await removeSuppression({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      entryId: target!.id,
    });
    expect(missing).toMatchObject({ ok: false });
  });

  it("scopes suppression to the workspace", async () => {
    const other = await createTestTenant(db, { key: "suppression-other" });
    expect(await isSuppressed(other.workspace.id, "dana@acme.test")).toBe(false);
  });
});
