import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

// These values must be set before the env module is imported, because it reads
// process.env once at module load.
const ENCRYPTION_KEY = randomBytes(32).toString("base64url");
process.env.INTEGRATION_ENCRYPTION_KEY = ENCRYPTION_KEY;
process.env.AI_API_KEY = "env-ai-key-0123456789";
process.env.AI_MODEL = "env-model";
delete process.env.AI_BASE_URL;
process.env.PRIMARY_LEAD_SOURCE = "apollo";
process.env.APOLLO_API_KEY = "env-apollo-key-0123456789";
delete process.env.PDL_API_KEY;
delete process.env.GOOGLE_PLACES_API_KEY;
process.env.RESEND_API_KEY = "env-resend-key-0123456789";
process.env.EMAIL_FROM = "server@example.test";
process.env.EMAIL_REPLY_TO = "server-reply@example.test";

const { createTempDatabase, createTestTenant } = await import("@/test/temp-db");
const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;

const { db } = await import("@/lib/db");
const {
  accountLabelFor,
  getIntegrationOverview,
  removeIntegration,
  saveIntegration,
} = await import("@/server/services/integrations");
const { getAiConfig } = await import("@/server/services/ai");
const { getActiveLeadSource } = await import("@/server/services/lead-sources");
const { resolveEmailConfig } = await import("@/lib/email/send");

const AI_SECRET = "workspace-ai-key-super-secret";
const AI_CREDENTIALS = {
  apiKey: AI_SECRET,
  model: "gpt-4.1-mini",
  baseUrl: undefined,
};

async function saveAi(workspaceId: string, actorId: string) {
  return saveIntegration({
    workspaceId,
    provider: "AI",
    credentials: AI_CREDENTIALS,
    accountLabel: accountLabelFor("AI", AI_CREDENTIALS),
    actorId,
  });
}

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

describe("per-workspace credentials", () => {
  it("stores AI credentials encrypted and resolves the workspace key over env", async () => {
    const tenant = await createTestTenant(db, { key: "integrations-ai" });

    const saved = await saveAi(tenant.workspace.id, tenant.user.id);
    expect(saved).toEqual({ ok: true });

    const row = await db.integration.findUniqueOrThrow({
      where: {
        workspaceId_provider: { workspaceId: tenant.workspace.id, provider: "AI" },
      },
    });
    expect(row.encryptedCredentials).toBeTruthy();
    expect(row.encryptedCredentials).not.toContain(AI_SECRET);
    expect(row.encryptedCredentials).not.toContain(AI_CREDENTIALS.model);
    expect(row.accountLabel).toBe(AI_CREDENTIALS.model);
    expect(row.status).toBe("ACTIVE");

    const overview = await getIntegrationOverview(tenant.workspace.id);
    expect(overview.encryptionConfigured).toBe(true);
    expect(overview.ai).toMatchObject({
      state: "ok",
      provider: "AI",
      accountLabel: AI_CREDENTIALS.model,
    });
    if (overview.ai.state !== "ok") throw new Error("expected readable credentials");
    expect(overview.ai.credentials.apiKey).toBe(AI_SECRET);

    const workspaceConfig = await getAiConfig(tenant.workspace.id);
    expect(workspaceConfig).toMatchObject({
      apiKey: AI_SECRET,
      model: AI_CREDENTIALS.model,
    });

    // A workspace without stored credentials still inherits the deployment key.
    expect(await getAiConfig()).toMatchObject({
      apiKey: "env-ai-key-0123456789",
      model: "env-model",
    });

    const audits = await db.auditLog.findMany({
      where: { workspaceId: tenant.workspace.id, action: "integration.credentials_saved" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata).toContain("AI");
    expect(JSON.stringify(audits)).not.toContain(AI_SECRET);
  });

  it("isolates tenants and refuses ciphertext copied to another workspace", async () => {
    const tenantA = await createTestTenant(db, { key: "integrations-tenant-a" });
    const tenantB = await createTestTenant(db, { key: "integrations-tenant-b" });

    expect(await saveAi(tenantA.workspace.id, tenantA.user.id)).toEqual({ ok: true });

    const stored = await db.integration.findUniqueOrThrow({
      where: {
        workspaceId_provider: { workspaceId: tenantA.workspace.id, provider: "AI" },
      },
    });

    const overviewB = await getIntegrationOverview(tenantB.workspace.id);
    expect(overviewB.ai.state).toBe("none");
    expect(await getAiConfig(tenantB.workspace.id)).toMatchObject({
      apiKey: "env-ai-key-0123456789",
    });

    // The authenticated additional data binds the row to workspace A. Copying
    // the ciphertext into workspace B must fail closed rather than decrypt.
    await db.integration.create({
      data: {
        workspaceId: tenantB.workspace.id,
        provider: "AI",
        status: "ACTIVE",
        accountLabel: "copied",
        encryptedCredentials: stored.encryptedCredentials,
      },
    });

    const copied = await getIntegrationOverview(tenantB.workspace.id);
    expect(copied.ai.state).toBe("error");
    expect(await getAiConfig(tenantB.workspace.id)).toBeNull();
  });

  it("fails closed on unreadable rows and restores env fallback after removal", async () => {
    const tenant = await createTestTenant(db, { key: "integrations-corrupt" });
    expect(await saveAi(tenant.workspace.id, tenant.user.id)).toEqual({ ok: true });

    await db.integration.update({
      where: {
        workspaceId_provider: { workspaceId: tenant.workspace.id, provider: "AI" },
      },
      data: { encryptedCredentials: "v1.bm90.a3JlZGl0cw.notciphertext" },
    });

    const overview = await getIntegrationOverview(tenant.workspace.id);
    expect(overview.ai.state).toBe("error");
    expect(await getAiConfig(tenant.workspace.id)).toBeNull();

    const removed = await removeIntegration({
      workspaceId: tenant.workspace.id,
      provider: "AI",
      actorId: tenant.user.id,
    });
    expect(removed).toEqual({ ok: true });

    expect((await getIntegrationOverview(tenant.workspace.id)).ai.state).toBe("none");
    expect(await getAiConfig(tenant.workspace.id)).toMatchObject({
      apiKey: "env-ai-key-0123456789",
      model: "env-model",
    });

    const removalAudits = await db.auditLog.findMany({
      where: {
        workspaceId: tenant.workspace.id,
        action: "integration.credentials_removed",
      },
    });
    expect(removalAudits).toHaveLength(1);
    expect(JSON.stringify(removalAudits)).not.toContain("v1.bm90");
  });

  it("resolves lead-source and email credentials per workspace", async () => {
    const tenantA = await createTestTenant(db, { key: "integrations-sources-a" });
    const tenantB = await createTestTenant(db, { key: "integrations-sources-b" });

    const envSource = await getActiveLeadSource(tenantA.workspace.id);
    expect(envSource.ok && envSource.source).toMatchObject({
      provider: "apollo",
      credentialSource: "server",
    });

    const leadCredentials = {
      provider: "pdl" as const,
      apiKey: "workspace-pdl-key-0123456789",
      baseUrl: undefined,
    };
    expect(
      await saveIntegration({
        workspaceId: tenantA.workspace.id,
        provider: "LEAD_SOURCE",
        credentials: leadCredentials,
        accountLabel: accountLabelFor("LEAD_SOURCE", leadCredentials),
        actorId: tenantA.user.id,
      }),
    ).toEqual({ ok: true });

    const workspaceSource = await getActiveLeadSource(tenantA.workspace.id);
    expect(workspaceSource.ok && workspaceSource.source).toMatchObject({
      provider: "pdl",
      apiKey: leadCredentials.apiKey,
      credentialSource: "workspace",
    });

    const otherSource = await getActiveLeadSource(tenantB.workspace.id);
    expect(otherSource.ok && otherSource.source).toMatchObject({
      provider: "apollo",
      credentialSource: "server",
    });

    const envEmail = await resolveEmailConfig(tenantA.workspace.id);
    expect(envEmail.ok && envEmail).toMatchObject({
      source: "server",
      config: { from: "server@example.test" },
    });

    const emailCredentials = {
      apiKey: "workspace-resend-key-0123456789",
      from: "outreach@workspace.test",
      replyTo: "reply@workspace.test",
    };
    expect(
      await saveIntegration({
        workspaceId: tenantA.workspace.id,
        provider: "EMAIL",
        credentials: emailCredentials,
        accountLabel: accountLabelFor("EMAIL", emailCredentials),
        actorId: tenantA.user.id,
      }),
    ).toEqual({ ok: true });

    const workspaceEmail = await resolveEmailConfig(tenantA.workspace.id);
    expect(workspaceEmail.ok && workspaceEmail).toMatchObject({
      source: "workspace",
      config: {
        apiKey: emailCredentials.apiKey,
        from: emailCredentials.from,
        replyTo: emailCredentials.replyTo,
      },
    });

    const otherEmail = await resolveEmailConfig(tenantB.workspace.id);
    expect(otherEmail.ok && otherEmail).toMatchObject({ source: "server" });

    expect(
      await removeIntegration({
        workspaceId: tenantA.workspace.id,
        provider: "EMAIL",
        actorId: tenantA.user.id,
      }),
    ).toEqual({ ok: true });
    const restored = await resolveEmailConfig(tenantA.workspace.id);
    expect(restored.ok && restored).toMatchObject({ source: "server" });
  });
});
