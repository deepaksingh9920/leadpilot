import { afterAll, describe, expect, it, vi } from "vitest";

// No encryption key in this file. Saving must refuse rather than write a
// plaintext or weakly-protected value, and an existing row must fail closed.
vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");
process.env.AI_API_KEY = "env-only-ai-key-0123456789";
process.env.AI_MODEL = "env-only-model";

const { createTempDatabase, createTestTenant } = await import("@/test/temp-db");
const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;

const { db } = await import("@/lib/db");
const { getIntegrationOverview, saveIntegration } = await import(
  "@/server/services/integrations"
);
const { getAiConfig } = await import("@/server/services/ai");

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

describe("credential storage without INTEGRATION_ENCRYPTION_KEY", () => {
  it("refuses to save and reports storage as disabled", async () => {
    const tenant = await createTestTenant(db, { key: "integrations-unconfigured" });

    const saved = await saveIntegration({
      workspaceId: tenant.workspace.id,
      provider: "AI",
      credentials: { apiKey: "plaintext-should-not-land", model: "gpt-4.1-mini" },
      accountLabel: "gpt-4.1-mini",
      actorId: tenant.user.id,
    });
    expect(saved.ok).toBe(false);

    expect(
      await db.integration.count({ where: { workspaceId: tenant.workspace.id } }),
    ).toBe(0);

    const overview = await getIntegrationOverview(tenant.workspace.id);
    expect(overview.encryptionConfigured).toBe(false);

    // No stored row, so the deployment default still applies.
    expect(await getAiConfig(tenant.workspace.id)).toMatchObject({
      apiKey: "env-only-ai-key-0123456789",
      model: "env-only-model",
    });
  });

  it("fails closed when a stored row exists but the key is missing", async () => {
    const tenant = await createTestTenant(db, { key: "integrations-locked-row" });

    await db.integration.create({
      data: {
        workspaceId: tenant.workspace.id,
        provider: "AI",
        status: "ACTIVE",
        accountLabel: "gpt-4.1-mini",
        encryptedCredentials: "v1.bm90.a3JlZGl0cw.notciphertext",
      },
    });

    const overview = await getIntegrationOverview(tenant.workspace.id);
    expect(overview.ai.state).toBe("error");
    expect(await getAiConfig(tenant.workspace.id)).toBeNull();
  });
});
