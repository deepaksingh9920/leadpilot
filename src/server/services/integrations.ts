import "server-only";

import type { z } from "zod";

import { writeAuditLog } from "@/lib/auth/audit";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { PROVIDER_LABELS } from "@/lib/providers/types";
import {
  aiCredentialsInputSchema,
  emailCredentialsInputSchema,
  leadSourceCredentialsInputSchema,
} from "@/lib/validation/integrations";

export const INTEGRATION_PROVIDERS = ["AI", "LEAD_SOURCE", "EMAIL"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type AiCredentials = z.infer<typeof aiCredentialsInputSchema>;
export type LeadSourceCredentials = z.infer<typeof leadSourceCredentialsInputSchema>;
export type EmailCredentials = z.infer<typeof emailCredentialsInputSchema>;

export type ReadResult<T> =
  | { state: "none"; provider: IntegrationProvider }
  | {
      state: "ok";
      provider: IntegrationProvider;
      credentials: T;
      accountLabel: string | null;
      updatedAt: Date;
    }
  | {
      state: "error";
      provider: IntegrationProvider;
      message: string;
      accountLabel: string | null;
      updatedAt: Date;
    };

export type IntegrationOverview = {
  ai: ReadResult<AiCredentials>;
  leadSource: ReadResult<LeadSourceCredentials>;
  email: ReadResult<EmailCredentials>;
  encryptionConfigured: boolean;
};

const DECRYPTION_FAILED =
  "The stored credentials cannot be decrypted with the current INTEGRATION_ENCRYPTION_KEY. Save them again on this page.";

function encryptionContext(workspaceId: string, provider: IntegrationProvider): string {
  return `${workspaceId}:${provider}`;
}

async function readStored<T>(
  workspaceId: string,
  provider: IntegrationProvider,
  schema: z.ZodType<T>,
): Promise<ReadResult<T>> {
  const record = await db.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
  });

  if (!record) return { state: "none", provider };

  if (!record.encryptedCredentials) {
    return {
      state: "error",
      provider,
      message: DECRYPTION_FAILED,
      accountLabel: record.accountLabel,
      updatedAt: record.updatedAt,
    };
  }

  if (!env.integrationEncryptionKey || !env.integrationEncryptionConfigured) {
    return {
      state: "error",
      provider,
      message:
        "Credential storage is not enabled on this deployment, so the saved credentials cannot be read. An operator must set INTEGRATION_ENCRYPTION_KEY.",
      accountLabel: record.accountLabel,
      updatedAt: record.updatedAt,
    };
  }

  const decrypted = decryptSecret(
    record.encryptedCredentials,
    encryptionContext(workspaceId, provider),
    env.integrationEncryptionKey,
  );
  if (!decrypted.ok) {
    return {
      state: "error",
      provider,
      message: DECRYPTION_FAILED,
      accountLabel: record.accountLabel,
      updatedAt: record.updatedAt,
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(decrypted.value);
  } catch {
    return {
      state: "error",
      provider,
      message: DECRYPTION_FAILED,
      accountLabel: record.accountLabel,
      updatedAt: record.updatedAt,
    };
  }

  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      state: "error",
      provider,
      message: DECRYPTION_FAILED,
      accountLabel: record.accountLabel,
      updatedAt: record.updatedAt,
    };
  }

  return {
    state: "ok",
    provider,
    credentials: parsed.data,
    accountLabel: record.accountLabel,
    updatedAt: record.updatedAt,
  };
}

export function readAiIntegration(workspaceId: string): Promise<ReadResult<AiCredentials>> {
  return readStored(workspaceId, "AI", aiCredentialsInputSchema);
}

export function readLeadSourceIntegration(
  workspaceId: string,
): Promise<ReadResult<LeadSourceCredentials>> {
  return readStored(workspaceId, "LEAD_SOURCE", leadSourceCredentialsInputSchema);
}

export function readEmailIntegration(
  workspaceId: string,
): Promise<ReadResult<EmailCredentials>> {
  return readStored(workspaceId, "EMAIL", emailCredentialsInputSchema);
}

export async function getIntegrationOverview(
  workspaceId: string,
): Promise<IntegrationOverview> {
  const [ai, leadSource, email] = await Promise.all([
    readAiIntegration(workspaceId),
    readLeadSourceIntegration(workspaceId),
    readEmailIntegration(workspaceId),
  ]);

  return {
    ai,
    leadSource,
    email,
    encryptionConfigured: env.integrationEncryptionConfigured,
  };
}

export type SaveIntegrationResult = { ok: true } | { ok: false; message: string };

export async function saveIntegration(input: {
  workspaceId: string;
  provider: IntegrationProvider;
  credentials: unknown;
  accountLabel: string;
  actorId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<SaveIntegrationResult> {
  if (!env.integrationEncryptionKey || !env.integrationEncryptionConfigured) {
    return {
      ok: false,
      message:
        "Credential storage is not enabled. An operator must set INTEGRATION_ENCRYPTION_KEY (at least 32 characters) and redeploy before keys can be saved.",
    };
  }

  let encrypted: string;
  try {
    encrypted = encryptSecret(
      JSON.stringify(input.credentials),
      encryptionContext(input.workspaceId, input.provider),
      env.integrationEncryptionKey,
    );
  } catch {
    return {
      ok: false,
      message:
        "Credentials could not be encrypted. Check the INTEGRATION_ENCRYPTION_KEY configuration and try again.",
    };
  }

  const record = await db.integration.upsert({
    where: {
      workspaceId_provider: { workspaceId: input.workspaceId, provider: input.provider },
    },
    create: {
      workspaceId: input.workspaceId,
      provider: input.provider,
      status: "ACTIVE",
      accountLabel: input.accountLabel,
      encryptedCredentials: encrypted,
      lastCheckedAt: null,
      error: null,
    },
    update: {
      status: "ACTIVE",
      accountLabel: input.accountLabel,
      encryptedCredentials: encrypted,
      lastCheckedAt: null,
      error: null,
    },
  });

  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "integration.credentials_saved",
    entityType: "Integration",
    entityId: record.id,
    metadata: { provider: input.provider, accountLabel: input.accountLabel },
    ip: input.ip ?? undefined,
    userAgent: input.userAgent ?? undefined,
  });

  return { ok: true };
}

export async function removeIntegration(input: {
  workspaceId: string;
  provider: IntegrationProvider;
  actorId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<SaveIntegrationResult> {
  const deleted = await db.integration.deleteMany({
    where: { workspaceId: input.workspaceId, provider: input.provider },
  });

  if (deleted.count > 0) {
    await writeAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "integration.credentials_removed",
      entityType: "Integration",
      entityId: input.provider,
      metadata: { provider: input.provider },
      ip: input.ip ?? undefined,
      userAgent: input.userAgent ?? undefined,
    });
  }

  return { ok: true };
}

/** Labels shown in the UI and audit log; never derived from the secret itself. */
export function accountLabelFor(
  provider: IntegrationProvider,
  credentials: AiCredentials | LeadSourceCredentials | EmailCredentials,
): string {
  if (provider === "AI") return (credentials as AiCredentials).model;
  if (provider === "LEAD_SOURCE") {
    return PROVIDER_LABELS[(credentials as LeadSourceCredentials).provider];
  }
  return (credentials as EmailCredentials).from;
}
