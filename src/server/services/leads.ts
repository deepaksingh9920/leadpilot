import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

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

export const VERIFICATION_LABELS: Record<string, string> = {
  UNVERIFIED: "Unverified",
  PARTIAL: "Partially verified",
  VERIFIED: "Verified",
};

const PAGE_SIZE = 25;

export async function getLeadsPage(
  workspaceId: string,
  input: { status?: string; query?: string; page?: number },
) {
  const page = Math.max(1, input.page ?? 1);
  const status =
    input.status && LEAD_STATUSES.includes(input.status as LeadStatus) ? input.status : undefined;
  const query = input.query?.trim();

  const where: Prisma.LeadWhereInput = {
    workspaceId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            { companyName: { contains: query } },
            { domain: { contains: query } },
            { contactEmail: { contains: query } },
            { contactName: { contains: query } },
          ],
        }
      : {}),
  };

  const [leads, total, counts] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
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
  };
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
