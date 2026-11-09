import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { parseCsv } from "@/lib/csv";
import { isFeatureEnabled } from "@/lib/features";
import {
  mappingIsUsable,
  prepareImport,
  type LeadImportMapping,
  type RowIssue,
} from "@/lib/leads/import";
import { reserveUsage, releaseUsage } from "@/server/services/workspaces";

const MAX_ROWS = 5000;
const REPORT_LIMIT = 200;

export type ImportResult =
  | {
      ok: true;
      importId: string;
      importedCount: number;
      duplicateCount: number;
      invalidCount: number;
    }
  | {
      ok: false;
      code: "EMPTY" | "MAPPING" | "LIMIT_REACHED" | "INVALID" | "DISABLED";
      message: string;
      issues?: RowIssue[];
    };

export type ImportLeadsInput = {
  workspaceId: string;
  userId: string;
  filename: string;
  content: string;
  mapping: LeadImportMapping;
  rightsConfirmed: boolean;
};

export async function importLeadsCsv(input: ImportLeadsInput): Promise<ImportResult> {
  if (!(await isFeatureEnabled("csv_import"))) {
    return {
      ok: false,
      code: "DISABLED",
      message: "CSV import is paused platform-wide by an administrator.",
    };
  }

  if (!input.rightsConfirmed) {
    return {
      ok: false,
      code: "INVALID",
      message: "Confirm that you hold the rights to use this data before importing.",
    };
  }

  if (!input.filename.toLowerCase().endsWith(".csv")) {
    return { ok: false, code: "INVALID", message: "Upload a .csv file." };
  }

  if (!mappingIsUsable(input.mapping)) {
    return {
      ok: false,
      code: "MAPPING",
      message: "Map at least the company name column before importing.",
    };
  }

  let parsed;
  try {
    parsed = parseCsv(input.content);
  } catch (error) {
    return {
      ok: false,
      code: "INVALID",
      message: error instanceof Error ? error.message : "The CSV could not be parsed.",
    };
  }

  if (!parsed.headers.length || parsed.rows.length === 0) {
    return {
      ok: false,
      code: "EMPTY",
      message: "The file has no data rows. A header row and at least one lead are required.",
    };
  }

  if (parsed.rows.length > MAX_ROWS) {
    return {
      ok: false,
      code: "INVALID",
      message: `This file has ${parsed.rows.length.toLocaleString()} rows. Import at most ${MAX_ROWS.toLocaleString()} at a time.`,
    };
  }

  const prepared = prepareImport(parsed.rows, input.mapping);
  if (prepared.rows.length === 0) {
    return {
      ok: false,
      code: "INVALID",
      message: "No valid rows were found. Fix the reported issues and try again.",
      issues: prepared.issues.slice(0, 20),
    };
  }

  const existingKeys = new Set<string>();
  for (let index = 0; index < prepared.rows.length; index += 400) {
    const chunk = prepared.rows.slice(index, index + 400).map((row) => row.dedupeKey);
    const found = await db.lead.findMany({
      where: { workspaceId: input.workspaceId, dedupeKey: { in: chunk } },
      select: { dedupeKey: true },
    });
    for (const row of found) if (row.dedupeKey) existingKeys.add(row.dedupeKey);
  }

  const newRows = prepared.rows.filter((row) => !existingKeys.has(row.dedupeKey));
  const existingDuplicateLines = prepared.rows
    .filter((row) => existingKeys.has(row.dedupeKey))
    .map((row) => row.line);
  const duplicateLines = [...prepared.duplicateLines, ...existingDuplicateLines].sort(
    (a, b) => a - b,
  );

  if (newRows.length === 0) {
    const report = buildReport(prepared.issues, duplicateLines);
    const record = await db.$transaction(async (tx) => {
      const source = await ensureCsvSource(tx, input.workspaceId, input.filename);
      const created = await tx.leadImport.create({
        data: {
          workspaceId: input.workspaceId,
          sourceId: source.id,
          createdById: input.userId,
          filename: input.filename,
          rowCount: parsed.rows.length,
          importedCount: 0,
          duplicateCount: duplicateLines.length,
          invalidCount: prepared.issues.length,
          report: JSON.stringify(report),
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorId: input.userId,
          action: "leads.imported",
          entityType: "LeadImport",
          entityId: created.id,
          metadata: JSON.stringify({
            filename: input.filename,
            imported: 0,
            duplicates: duplicateLines.length,
            invalid: prepared.issues.length,
          }),
        },
      });
      return created;
    });

    return {
      ok: true,
      importId: record.id,
      importedCount: 0,
      duplicateCount: duplicateLines.length,
      invalidCount: prepared.issues.length,
    };
  }

  const subscription = await db.subscription.findUnique({
    where: { workspaceId: input.workspaceId },
    include: { plan: { include: { limits: true } } },
  });
  const leadLimit =
    subscription?.plan.limits.find((limit) => limit.metric === "leads_per_month")?.limit ?? 0;

  try {
    const result = await db.$transaction(async (tx) => {
      const reserved = await reserveUsage(
        tx,
        input.workspaceId,
        "leads_per_month",
        newRows.length,
        leadLimit,
      );
      if (!reserved.ok) {
        throw new ImportLimitError(reserved.reason);
      }

      const source = await ensureCsvSource(tx, input.workspaceId, input.filename);

      let imported = 0;
      let duplicateCount = duplicateLines.length;
      const now = new Date();

      for (const row of newRows) {
        try {
          const lead = await tx.lead.create({
            data: {
              workspaceId: input.workspaceId,
              companyName: row.companyName,
              domain: row.domain,
              website: row.website,
              industry: row.industry,
              location: row.location,
              employeeCount: row.employeeCount,
              revenueBand: row.revenueBand,
              description: row.description,
              contactName: row.contactName,
              contactTitle: row.contactTitle,
              contactEmail: row.contactEmail,
              contactPhone: row.contactPhone,
              linkedinUrl: row.linkedinUrl,
              sourceId: source.id,
              sourceRecordId: row.sourceRecordId,
              sourceUrl: row.sourceUrl,
              retrievedAt: now,
              dedupeKey: row.dedupeKey,
              verificationStatus: row.sourceUrl ? "PARTIAL" : "UNVERIFIED",
              tags: JSON.stringify(row.tags),
              notes: null,
            },
          });

          if (row.sourceUrl) {
            await tx.leadFieldVerification.createMany({
              data: [
                {
                  leadId: lead.id,
                  field: "companyName",
                  status: "PARTIAL",
                  sourceUrl: row.sourceUrl,
                  note: "Imported from a file; confirm against the evidence URL.",
                },
              ],
            });
          }

          await tx.leadActivity.create({
            data: {
              leadId: lead.id,
              actorId: input.userId,
              type: "IMPORTED",
              detail: JSON.stringify({ filename: input.filename, line: row.line }),
            },
          });

          imported += 1;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            duplicateCount += 1;
            continue;
          }
          throw error;
        }
      }

      const unused = newRows.length - imported;
      if (unused > 0) {
        await releaseUsage(tx, input.workspaceId, "leads_per_month", unused);
      }

      const report = buildReport(prepared.issues, duplicateLines);
      const record = await tx.leadImport.create({
        data: {
          workspaceId: input.workspaceId,
          sourceId: source.id,
          createdById: input.userId,
          filename: input.filename,
          rowCount: parsed.rows.length,
          importedCount: imported,
          duplicateCount,
          invalidCount: prepared.issues.length,
          report: JSON.stringify(report),
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorId: input.userId,
          action: "leads.imported",
          entityType: "LeadImport",
          entityId: record.id,
          metadata: JSON.stringify({
            filename: input.filename,
            imported,
            duplicates: duplicateCount,
            invalid: prepared.issues.length,
          }),
        },
      });

      return { record, imported, duplicateCount };
    });

    return {
      ok: true,
      importId: result.record.id,
      importedCount: result.imported,
      duplicateCount: result.duplicateCount,
      invalidCount: prepared.issues.length,
    };
  } catch (error) {
    if (error instanceof ImportLimitError) {
      return { ok: false, code: "LIMIT_REACHED", message: error.message };
    }
    console.error("Lead import failed", error);
    return {
      ok: false,
      code: "INVALID",
      message: "The import could not be completed. No rows were saved.",
    };
  }
}

class ImportLimitError extends Error {}

async function ensureCsvSource(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  filename: string,
) {
  const existing = await tx.leadSource.findFirst({
    where: { workspaceId, provider: "csv" },
  });
  if (existing) return existing;

  return tx.leadSource.create({
    data: {
      workspaceId,
      provider: "csv",
      type: "CSV",
      name: "CSV import",
      licenseNote: `Uploaded by the workspace operator (${filename}). Rights confirmed at import time.`,
    },
  });
}

function buildReport(issues: RowIssue[], duplicateLines: number[]) {
  return {
    issues: issues.slice(0, REPORT_LIMIT),
    truncatedIssues: Math.max(0, issues.length - REPORT_LIMIT),
    duplicateLines: duplicateLines.slice(0, REPORT_LIMIT),
    truncatedDuplicates: Math.max(0, duplicateLines.length - REPORT_LIMIT),
  };
}

export async function getImportReport(workspaceId: string, importId: string) {
  const record = await db.leadImport.findFirst({
    where: { id: importId, workspaceId },
    include: {
      source: { select: { name: true, provider: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!record) return null;

  let parsed: {
    issues: RowIssue[];
    duplicateLines: number[];
    truncatedIssues: number;
    truncatedDuplicates: number;
  } = { issues: [], duplicateLines: [], truncatedIssues: 0, truncatedDuplicates: 0 };
  try {
    parsed = { ...parsed, ...JSON.parse(record.report) };
  } catch {
    // Keep the empty report; the counters on the record are still accurate.
  }

  return { record, report: parsed };
}

export async function getRecentImports(workspaceId: string, take = 10) {
  return db.leadImport.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take,
    include: { createdBy: { select: { name: true } } },
  });
}
