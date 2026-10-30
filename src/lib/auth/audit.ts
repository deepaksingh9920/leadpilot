import "server-only";

import { db } from "@/lib/db";

type AuditInput = {
  workspaceId?: string | null;
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
};

export async function writeAuditLog(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: JSON.stringify(input.metadata ?? {}),
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  } catch (error) {
    // Auditing must never break the user's action, but it must be visible.
    console.error("Failed to write audit log", { action: input.action, error });
  }
}
