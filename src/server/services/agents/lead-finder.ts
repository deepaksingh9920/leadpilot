import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { PermanentJobError } from "@/lib/jobs/policy";
import type { LeadSearchQuery, SourcedLead } from "@/lib/providers/types";
import type { JobExecutionContext } from "@/server/services/jobs";
import {
  getActiveLeadSource,
  searchPrimaryLeadSource,
  type ActiveLeadSource,
} from "@/server/services/lead-sources";
import { getWorkspaceLimits, releaseUsage, reserveUsage } from "@/server/services/workspaces";

import { throwAsJobError } from "./errors";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

class LeadLimitError extends Error {}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

export async function executeLeadFinder(
  context: JobExecutionContext,
): Promise<Record<string, unknown>> {
  const active = await getActiveLeadSource(context.workspaceId);
  if (!active.ok) throw new PermanentJobError(active.message);

  const profile = await db.businessProfile.findUnique({
    where: { workspaceId: context.workspaceId },
  });

  const industry = text(context.input.industry) ?? profile?.industry ?? undefined;
  const region = text(context.input.region) ?? profile?.regions ?? undefined;
  if (!industry || !region) {
    throw new PermanentJobError(
      "Lead Finder needs an industry and region. Add them to the run form or your business profile.",
    );
  }

  const query: LeadSearchQuery = {
    industry,
    region,
    companySize: text(context.input.companySize) ?? profile?.companySize ?? null,
    targetCustomerType:
      text(context.input.targetCustomerType) ?? profile?.targetCustomerTypes ?? null,
    limit: readLimit(context.input.limit),
  };

  await context.step("resolve-source", "SUCCEEDED", {
    provider: active.source.provider,
    label: active.source.label,
  });

  await context.step("search-source", "RUNNING", { limit: query.limit });
  let search: Awaited<ReturnType<typeof searchPrimaryLeadSource>>;
  try {
    search = await searchPrimaryLeadSource(query, { workspaceId: context.workspaceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider search failed";
    await context.step("search-source", "FAILED", { message: message.slice(0, 500) });
    throwAsJobError(error);
  }

  await context.step("search-source", "SUCCEEDED", {
    provider: search.provider,
    found: search.result.records.length,
    skipped: search.result.skipped,
    notes: search.result.notes,
  });

  const seen = new Set<string>();
  const candidates: SourcedLead[] = [];
  let duplicateInBatch = 0;
  for (const record of search.result.records) {
    if (seen.has(record.dedupeKey)) {
      duplicateInBatch += 1;
      continue;
    }
    seen.add(record.dedupeKey);
    candidates.push(record);
  }

  const existingKeys = new Set<string>();
  for (let index = 0; index < candidates.length; index += 400) {
    const chunk = candidates.slice(index, index + 400).map((record) => record.dedupeKey);
    const found = await db.lead.findMany({
      where: { workspaceId: context.workspaceId, dedupeKey: { in: chunk } },
      select: { dedupeKey: true },
    });
    for (const row of found) if (row.dedupeKey) existingKeys.add(row.dedupeKey);
  }

  const newRecords = candidates.filter((record) => !existingKeys.has(record.dedupeKey));
  const duplicates = duplicateInBatch + existingKeys.size;

  await context.step("store-leads", "RUNNING", { candidates: newRecords.length });
  let stored = 0;
  let sourceId: string | null = null;
  let extraDuplicates = 0;

  if (newRecords.length > 0) {
    try {
      const outcome = await db.$transaction(async (tx) => {
        const limits = await getWorkspaceLimits(context.workspaceId);
        const leadLimit = limits.leads_per_month ?? 0;
        const reserved = await reserveUsage(
          tx,
          context.workspaceId,
          "leads_per_month",
          newRecords.length,
          leadLimit,
        );
        if (!reserved.ok) throw new LeadLimitError(reserved.reason);

        const source = await ensureProviderSource(tx, context.workspaceId, active.source);

        let createdCount = 0;
        let duplicateCount = 0;
        for (const record of newRecords) {
          try {
            const lead = await tx.lead.create({
              data: {
                workspaceId: context.workspaceId,
                companyName: record.companyName,
                domain: record.domain,
                industry: record.industry,
                location: record.location,
                employeeCount: record.employeeCount,
                revenueBand: record.revenueBand,
                description: record.description,
                website: record.website,
                contactName: record.contactName,
                contactTitle: record.contactTitle,
                contactEmail: record.contactEmail,
                contactPhone: record.contactPhone,
                linkedinUrl: record.linkedinUrl,
                sourceId: source.id,
                sourceRecordId: record.sourceRecordId,
                sourceUrl: record.sourceUrl,
                retrievedAt: record.retrievedAt,
                dedupeKey: record.dedupeKey,
                verificationStatus: record.sourceUrl ? "PARTIAL" : "UNVERIFIED",
                tags: JSON.stringify(record.tags),
              },
            });

            const verifications = verificationRows(lead.id, record, active.source);
            if (verifications.length > 0) {
              await tx.leadFieldVerification.createMany({ data: verifications });
            }

            await tx.leadActivity.create({
              data: {
                leadId: lead.id,
                type: "DISCOVERED",
                detail: JSON.stringify({
                  provider: active.source.provider,
                  sourceRecordId: record.sourceRecordId,
                }),
              },
            });
            createdCount += 1;
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
              duplicateCount += 1;
              continue;
            }
            throw error;
          }
        }

        const unused = newRecords.length - createdCount;
        if (unused > 0) {
          await releaseUsage(tx, context.workspaceId, "leads_per_month", unused);
        }

        await tx.leadSource.update({
          where: { id: source.id },
          data: { lastSyncedAt: new Date() },
        });

        await tx.auditLog.create({
          data: {
            workspaceId: context.workspaceId,
            action: "agent.leads_discovered",
            entityType: "Job",
            entityId: context.jobId,
            metadata: JSON.stringify({
              provider: active.source.provider,
              found: search.result.records.length,
              stored: createdCount,
              duplicates: duplicates + duplicateCount,
              skipped: search.result.skipped,
            }),
          },
        });

        return { sourceId: source.id, stored: createdCount, duplicates: duplicateCount };
      });

      stored = outcome.stored;
      sourceId = outcome.sourceId;
      extraDuplicates = outcome.duplicates;
    } catch (error) {
      if (error instanceof LeadLimitError) throw new PermanentJobError(error.message);
      throwAsJobError(error);
    }
  }

  const totalDuplicates = duplicates + extraDuplicates;
  await context.step("store-leads", "SUCCEEDED", {
    stored,
    duplicates: totalDuplicates,
    skipped: search.result.skipped,
  });

  return {
    provider: search.provider,
    requested: query.limit,
    found: search.result.records.length,
    stored,
    duplicates: totalDuplicates,
    skipped: search.result.skipped,
    notes: search.result.notes,
    sourceId,
  };
}

async function ensureProviderSource(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  source: ActiveLeadSource,
) {
  const existing = await tx.leadSource.findFirst({
    where: { workspaceId, provider: source.provider },
  });
  if (existing) {
    return tx.leadSource.update({
      where: { id: existing.id },
      data: {
        name: source.label,
        licenseNote: source.licenseNote,
        termsUrl: source.termsUrl,
      },
    });
  }

  return tx.leadSource.create({
    data: {
      workspaceId,
      provider: source.provider,
      type: "API",
      name: source.label,
      licenseNote: source.licenseNote,
      termsUrl: source.termsUrl,
    },
  });
}

function verificationRows(
  leadId: string,
  record: SourcedLead,
  source: ActiveLeadSource,
): Prisma.LeadFieldVerificationCreateManyInput[] {
  if (!record.sourceUrl) return [];

  const checkedAt = new Date();
  const rows: Prisma.LeadFieldVerificationCreateManyInput[] = [
    {
      leadId,
      field: "companyName",
      status: "PARTIAL",
      sourceUrl: record.sourceUrl,
      checkedAt,
      note: `Provided by ${source.label}; confirm against the evidence URL.`,
    },
  ];

  if (record.contactEmail) {
    rows.push({
      leadId,
      field: "contactEmail",
      status: "PARTIAL",
      sourceUrl: record.sourceUrl,
      checkedAt,
      note: `Provider-supplied address from ${source.label}; not independently verified.`,
    });
  }
  if (record.contactPhone) {
    rows.push({
      leadId,
      field: "contactPhone",
      status: "PARTIAL",
      sourceUrl: record.sourceUrl,
      checkedAt,
      note: `Provider-supplied phone from ${source.label}; not independently verified.`,
    });
  }

  return rows;
}
