import "server-only";

import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/auth/audit";
import { CsvParseError, parseCsv } from "@/lib/csv";
import {
  SUPPRESSION_REASONS,
  SUPPRESSION_REASON_LABELS,
  type SuppressionReason,
} from "@/lib/outreach/suppression";
import { normalizeEmail } from "@/lib/security/hash";

export {
  SUPPRESSION_REASONS,
  SUPPRESSION_REASON_LABELS,
  type SuppressionReason,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IMPORT_ROWS = 5000;

export type SuppressionRow = {
  id: string;
  email: string;
  reason: string;
  source: string | null;
  createdAt: Date;
};

export function normalizeSuppressionEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = normalizeEmail(value);
  if (!EMAIL_PATTERN.test(email)) return null;
  return email;
}

export async function isSuppressed(workspaceId: string, email: string): Promise<boolean> {
  const normalized = normalizeSuppressionEmail(email);
  if (!normalized) return false;
  const entry = await db.suppressionEntry.findUnique({
    where: { workspaceId_normalizedEmail: { workspaceId, normalizedEmail: normalized } },
    select: { id: true },
  });
  return Boolean(entry);
}

export async function listSuppressions(
  workspaceId: string,
  options: { query?: string; limit?: number } = {},
): Promise<SuppressionRow[]> {
  const query = options.query?.trim().toLowerCase();
  const limit = Math.min(500, Math.max(1, options.limit ?? 200));

  return db.suppressionEntry.findMany({
    where: {
      workspaceId,
      ...(query ? { normalizedEmail: { contains: query } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, email: true, reason: true, source: true, createdAt: true },
  });
}

export async function countSuppressions(workspaceId: string): Promise<number> {
  return db.suppressionEntry.count({ where: { workspaceId } });
}

/** Returns the normalized subset of the supplied addresses that are suppressed. */
export async function getSuppressedEmails(
  workspaceId: string,
  emails: readonly string[],
): Promise<Set<string>> {
  const normalized = [
    ...new Set(
      emails
        .map((email) => normalizeSuppressionEmail(email))
        .filter((email): email is string => Boolean(email)),
    ),
  ];
  if (normalized.length === 0) return new Set();

  const rows = await db.suppressionEntry.findMany({
    where: { workspaceId, normalizedEmail: { in: normalized } },
    select: { normalizedEmail: true },
  });
  return new Set(rows.map((row) => row.normalizedEmail));
}

export type SuppressionResult =
  | { ok: true; entry: SuppressionRow }
  | { ok: false; code: "INVALID" | "DUPLICATE" | "NOT_FOUND"; message: string };

export async function addSuppression(input: {
  workspaceId: string;
  actorId?: string | null;
  email: string;
  reason: SuppressionReason;
  source?: string | null;
}): Promise<SuppressionResult> {
  const normalized = normalizeSuppressionEmail(input.email);
  if (!normalized) {
    return { ok: false, code: "INVALID", message: "Enter a valid email address." };
  }
  if (!SUPPRESSION_REASONS.includes(input.reason)) {
    return { ok: false, code: "INVALID", message: "Choose a valid suppression reason." };
  }

  const existing = await db.suppressionEntry.findUnique({
    where: {
      workspaceId_normalizedEmail: { workspaceId: input.workspaceId, normalizedEmail: normalized },
    },
  });
  if (existing) {
    return {
      ok: false,
      code: "DUPLICATE",
      message: `${normalized} is already suppressed in this workspace.`,
    };
  }

  try {
    const entry = await db.suppressionEntry.create({
      data: {
        workspaceId: input.workspaceId,
        email: input.email.trim().slice(0, 254),
        normalizedEmail: normalized,
        reason: input.reason,
        source: input.source?.trim().slice(0, 200) || null,
      },
      select: { id: true, email: true, reason: true, source: true, createdAt: true },
    });

    await writeAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: "suppression.added",
      entityType: "SuppressionEntry",
      entityId: entry.id,
      metadata: { reason: input.reason, source: input.source ?? null },
    });

    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: "DUPLICATE", message: `${normalized} is already suppressed.` };
    }
    console.error("Could not add suppression", error);
    return { ok: false, code: "INVALID", message: "The suppression could not be saved." };
  }
}

export async function removeSuppression(input: {
  workspaceId: string;
  actorId?: string | null;
  entryId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const entry = await db.suppressionEntry.findFirst({
    where: { id: input.entryId, workspaceId: input.workspaceId },
    select: { id: true, email: true },
  });
  if (!entry) return { ok: false, message: "Suppression entry not found." };

  await db.suppressionEntry.delete({ where: { id: entry.id } });
  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? null,
    action: "suppression.removed",
    entityType: "SuppressionEntry",
    entityId: entry.id,
    metadata: { email: entry.email },
  });

  return { ok: true };
}

export type SuppressionImportResult =
  | {
      ok: true;
      added: number;
      duplicates: number;
      invalid: number;
      total: number;
      errors: { line: number; message: string }[];
    }
  | { ok: false; message: string };

export async function importSuppressionsCsv(input: {
  workspaceId: string;
  actorId?: string | null;
  content: string;
  filename?: string;
}): Promise<SuppressionImportResult> {
  if (!input.content.trim()) {
    return { ok: false, message: "The file is empty." };
  }

  let parsed;
  try {
    parsed = parseCsv(input.content);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof CsvParseError ? error.message : "The file could not be parsed.",
    };
  }

  let headers = parsed.headers;
  let rows = parsed.rows;

  // A one-column list of addresses often has no header. Treat the first row as
  // data when it already looks like an email.
  if (headers.length === 1 && EMAIL_PATTERN.test(headers[0] ?? "")) {
    rows = [{ values: [headers[0]], line: 1 }, ...rows];
    headers = ["email"];
  }

  if (rows.length === 0) {
    return { ok: false, message: "The file has no email rows." };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      message: `Import at most ${MAX_IMPORT_ROWS.toLocaleString()} addresses at a time.`,
    };
  }

  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());
  const emailIndex = normalizedHeaders.findIndex((header) => header.includes("email"));
  if (emailIndex === -1) {
    return { ok: false, message: "Add a column named Email." };
  }
  const reasonIndex = normalizedHeaders.findIndex((header) => header.includes("reason"));

  const errors: { line: number; message: string }[] = [];
  const candidates = new Map<string, { email: string; reason: SuppressionReason }>();
  let invalid = 0;

  for (const row of rows) {
    const raw = row.values[emailIndex] ?? "";
    const normalized = normalizeSuppressionEmail(raw);
    if (!normalized) {
      invalid += 1;
      pushError(errors, row.line, "Not a valid email address.");
      continue;
    }

    const rawReason = (reasonIndex >= 0 ? row.values[reasonIndex] ?? "" : "").toUpperCase();
    const reason = (SUPPRESSION_REASONS as readonly string[]).includes(rawReason)
      ? (rawReason as SuppressionReason)
      : "MANUAL";

    if (!candidates.has(normalized)) {
      candidates.set(normalized, { email: raw.trim().slice(0, 254), reason });
    }
  }

  const emails = [...candidates.keys()];
  const existing = emails.length
    ? await db.suppressionEntry.findMany({
        where: { workspaceId: input.workspaceId, normalizedEmail: { in: emails } },
        select: { normalizedEmail: true },
      })
    : [];
  const existingSet = new Set(existing.map((row) => row.normalizedEmail));

  const toCreate = emails
    .filter((email) => !existingSet.has(email))
    .map((email) => {
      const candidate = candidates.get(email)!;
      return {
        workspaceId: input.workspaceId,
        email: candidate.email,
        normalizedEmail: email,
        reason: candidate.reason,
        source: `CSV import${input.filename ? `: ${input.filename.slice(0, 120)}` : ""}`,
      };
    });

  if (toCreate.length > 0) {
    await db.suppressionEntry.createMany({ data: toCreate });
    await writeAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: "suppression.imported",
      entityType: "SuppressionEntry",
      metadata: {
        added: toCreate.length,
        duplicates: existingSet.size,
        invalid,
        total: rows.length,
      },
    });
  }

  return {
    ok: true,
    added: toCreate.length,
    duplicates: emails.length - toCreate.length,
    invalid,
    total: rows.length,
    errors: errors.slice(0, 20),
  };
}

function pushError(errors: { line: number; message: string }[], line: number, message: string) {
  if (errors.length < 20) errors.push({ line, message });
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}
