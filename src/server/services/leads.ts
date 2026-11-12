import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { containsInsensitive } from "@/lib/db/text-search";

export const LEAD_STATUSES = [
  "NEW",
  "QUALIFIED",
  "CONTACTED",
  "NURTURE",
  "DISQUALIFIED",
  "CONVERTED",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  QUALIFIED: "Qualified",
  CONTACTED: "Contacted",
  NURTURE: "Nurture",
  DISQUALIFIED: "Disqualified",
  CONVERTED: "Converted",
};

export const VERIFICATION_STATUSES = ["UNVERIFIED", "PARTIAL", "VERIFIED"] as const;

export const VERIFICATION_LABELS: Record<string, string> = {
  UNVERIFIED: "Unverified",
  PARTIAL: "Partially verified",
  VERIFIED: "Verified",
};

export const LEAD_SORT_FIELDS = {
  company: "companyName",
  score: "score",
  status: "status",
  added: "createdAt",
  updated: "updatedAt",
} as const;

export type LeadSortField = keyof typeof LEAD_SORT_FIELDS;

const PAGE_SIZE = 25;

export type LeadsQuery = {
  status?: string;
  verification?: string;
  query?: string;
  page?: number;
  sort?: string;
  dir?: string;
};

export async function getLeadsPage(workspaceId: string, input: LeadsQuery) {
  const page = Math.max(1, input.page ?? 1);
  const status =
    input.status && LEAD_STATUSES.includes(input.status as LeadStatus) ? input.status : undefined;
  const verification =
    input.verification &&
    VERIFICATION_STATUSES.includes(input.verification as (typeof VERIFICATION_STATUSES)[number])
      ? input.verification
      : undefined;
  const query = input.query?.trim();
  const sort = (input.sort && input.sort in LEAD_SORT_FIELDS
    ? input.sort
    : "added") as LeadSortField;
  const dir = input.dir === "asc" ? "asc" : "desc";

  const where: Prisma.LeadWhereInput = {
    workspaceId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(verification ? { verificationStatus: verification } : {}),
    ...(query
      ? {
          OR: [
            { companyName: containsInsensitive(query) },
            { domain: containsInsensitive(query) },
            { contactEmail: containsInsensitive(query) },
            { contactName: containsInsensitive(query) },
            { location: containsInsensitive(query) },
          ],
        }
      : {}),
  };

  const [leads, total, counts] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: [{ [LEAD_SORT_FIELDS[sort]]: dir }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        source: { select: { name: true, provider: true, type: true } },
        owner: { select: { name: true } },
      },
    }),
    db.lead.count({ where }),
    db.lead.groupBy({
      by: ["status"],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const statusCounts = Object.fromEntries(counts.map((row) => [row.status, row._count._all]));
  const totalAll = counts.reduce((sum, row) => sum + row._count._all, 0);

  return {
    leads,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    statusCounts,
    totalAll,
    sort,
    dir,
    verification,
  };
}

export async function getLeadDetail(workspaceId: string, leadId: string) {
  return db.lead.findFirst({
    where: { id: leadId, workspaceId, deletedAt: null },
    include: {
      source: true,
      owner: { select: { id: true, name: true } },
      verifications: { orderBy: { field: "asc" } },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { name: true } } },
      },
      campaignLeads: {
        include: { campaign: { select: { id: true, name: true, status: true } } },
      },
      outreachMessages: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, subject: true, status: true, createdAt: true },
      },
    },
  });
}

export async function getLeadsForExport(workspaceId: string) {
  return db.lead.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 10_000,
    include: {
      source: { select: { name: true, provider: true, type: true, termsUrl: true } },
      verifications: { select: { field: true, status: true, sourceUrl: true, checkedAt: true } },
    },
  });
}

export async function getCampaignsForWorkspace(workspaceId: string) {
  const campaigns = await db.campaign.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { leads: true, messages: true } },
    },
  });

  return campaigns;
}

export async function getCampaignDetail(workspaceId: string, campaignId: string) {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId },
    include: {
      createdBy: { select: { name: true } },
      leads: {
        orderBy: { addedAt: "desc" },
        include: {
          lead: {
            select: {
              id: true,
              companyName: true,
              domain: true,
              contactName: true,
              contactEmail: true,
              status: true,
              score: true,
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 25,
        select: { id: true, subject: true, status: true, createdAt: true },
      },
    },
  });

  if (!campaign) return null;

  const funnel = {
    added: campaign.leads.length,
    drafted: campaign.leads.filter((row) => row.stage === "DRAFTED").length,
    approved: campaign.leads.filter((row) => row.stage === "APPROVED").length,
    sent: campaign.leads.filter((row) => row.stage === "SENT").length,
    replied: campaign.leads.filter((row) => row.stage === "REPLIED").length,
  };

  return { campaign, funnel };
}

export async function getQualifiedLeadOptions(workspaceId: string, limit = 200) {
  return db.lead.findMany({
    where: { workspaceId, deletedAt: null, status: "QUALIFIED" },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, companyName: true, domain: true, contactName: true, contactEmail: true },
  });
}
