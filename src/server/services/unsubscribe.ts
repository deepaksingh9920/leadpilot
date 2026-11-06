import "server-only";

import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/auth/audit";
import { verifyUnsubscribeToken } from "@/lib/outreach/unsubscribe";
import { normalizeEmail, sha256 } from "@/lib/security/hash";
import { addSuppression, isSuppressed } from "@/server/services/suppression";

export type UnsubscribeResult =
  | { ok: true; email: string; alreadySuppressed: boolean }
  | { ok: false; message: string };

export type UnsubscribePreview =
  | {
      ok: true;
      workspaceName: string;
      maskedEmail: string;
      alreadySuppressed: boolean;
    }
  | { ok: false; message: string };

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "this address";
  const visible = local.slice(0, 1);
  return `${visible}${"•".repeat(Math.min(4, Math.max(2, local.length - 1)))}@${domain}`;
}

async function loadTokenMessage(token: string) {
  const payload = verifyUnsubscribeToken(token);
  if (!payload) return null;

  const message = await db.outreachMessage.findFirst({
    where: { id: payload.messageId, workspaceId: payload.workspaceId },
    include: {
      lead: { select: { id: true, contactEmail: true } },
      workspace: { select: { name: true } },
    },
  });
  if (!message) return null;
  if (!message.unsubscribeTokenHash) return null;
  if (message.unsubscribeTokenHash !== sha256(token)) return null;

  const tokenEmail = normalizeEmail(payload.email);
  const leadEmail = normalizeEmail(message.lead.contactEmail ?? "");
  if (!leadEmail || tokenEmail !== leadEmail) return null;

  return { message, email: leadEmail };
}

/** Read-only data for the public unsubscribe confirmation page. */
export async function getUnsubscribePreview(token: string): Promise<UnsubscribePreview> {
  const loaded = await loadTokenMessage(token);
  if (!loaded) {
    return { ok: false, message: "This unsubscribe link is invalid or has expired." };
  }

  return {
    ok: true,
    workspaceName: loaded.message.workspace.name,
    maskedEmail: maskEmail(loaded.email),
    alreadySuppressed: await isSuppressed(loaded.message.workspaceId, loaded.email),
  };
}

/**
 * Verifies a signed unsubscribe token against the stored message hash, then
 * records a suppression. No login is required, but the token must match both
 * the message and the recipient it was issued for.
 */
export async function unsubscribeWithToken(token: string): Promise<UnsubscribeResult> {
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return { ok: false, message: "This unsubscribe link is invalid or incomplete." };
  }

  const message = await db.outreachMessage.findFirst({
    where: { id: payload.messageId, workspaceId: payload.workspaceId },
    include: {
      lead: { select: { id: true, contactEmail: true } },
    },
  });
  if (!message) {
    return { ok: false, message: "This unsubscribe link no longer matches a message." };
  }
  if (!message.unsubscribeTokenHash) {
    return { ok: false, message: "This unsubscribe link is not active." };
  }
  if (message.unsubscribeTokenHash !== sha256(token)) {
    return { ok: false, message: "This unsubscribe link is invalid." };
  }

  const tokenEmail = normalizeEmail(payload.email);
  const leadEmail = normalizeEmail(message.lead.contactEmail ?? "");
  if (!leadEmail || tokenEmail !== leadEmail) {
    return { ok: false, message: "This unsubscribe link does not match the recipient." };
  }

  const result = await addSuppression({
    workspaceId: payload.workspaceId,
    email: leadEmail,
    reason: "UNSUBSCRIBED",
    source: `Unsubscribe link · message ${message.id}`,
  });

  if (!result.ok && result.code !== "DUPLICATE") {
    return { ok: false, message: result.message };
  }

  if (result.ok) {
    await writeAuditLog({
      workspaceId: payload.workspaceId,
      action: "outreach.unsubscribed",
      entityType: "OutreachMessage",
      entityId: message.id,
      metadata: { leadId: message.lead.id },
    });
    await db.leadActivity
      .create({
        data: {
          leadId: message.lead.id,
          type: "UNSUBSCRIBED",
          detail: JSON.stringify({ messageId: message.id }),
        },
      })
      .catch(() => undefined);
  }

  return {
    ok: true,
    email: leadEmail,
    alreadySuppressed: !result.ok && result.code === "DUPLICATE",
  };
}
