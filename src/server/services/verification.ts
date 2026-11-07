import "server-only";

import { db } from "@/lib/db";

export const VERIFIABLE_FIELDS = [
  "companyName",
  "website",
  "industry",
  "location",
  "contactName",
  "contactTitle",
  "contactEmail",
  "contactPhone",
  "linkedinUrl",
] as const;

export type VerifiableField = (typeof VERIFIABLE_FIELDS)[number];

export const VERIFIABLE_FIELD_LABELS: Record<string, string> = {
  companyName: "Company name",
  website: "Website",
  industry: "Industry",
  location: "Location",
  contactName: "Contact name",
  contactTitle: "Contact title",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
  linkedinUrl: "LinkedIn URL",
};

export const FIELD_VERIFICATION_STATUSES = ["VERIFIED", "PARTIAL", "UNVERIFIED"] as const;

export type FieldVerificationStatus = (typeof FIELD_VERIFICATION_STATUSES)[number];

export type VerificationFailure = {
  ok: false;
  code: "INVALID" | "NOT_FOUND";
  message: string;
};

const FIELD_STATUS_LABELS: Record<string, string> = {
  VERIFIED: "Verified",
  PARTIAL: "Partially verified",
  UNVERIFIED: "Unverified",
};

function isVerifiableField(value: string): value is VerifiableField {
  return (VERIFIABLE_FIELDS as readonly string[]).includes(value);
}

function isFieldStatus(value: string): value is FieldVerificationStatus {
  return (FIELD_VERIFICATION_STATUSES as readonly string[]).includes(value);
}

function normalizeSourceUrl(value: string | null | undefined):
  | { ok: true; url: string | null }
  | { ok: false; message: string } {
  const trimmed = value?.trim();
  if (!trimmed) return { ok: true, url: null };

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, message: "Evidence links must use http or https." };
    }
    return { ok: true, url: parsed.toString().slice(0, 2000) };
  } catch {
    return { ok: false, message: "Enter a complete http(s) evidence URL." };
  }
}

function defaultNote(status: FieldVerificationStatus): string {
  if (status === "VERIFIED") return "Checked manually by a workspace admin.";
  if (status === "PARTIAL") return "Only partly confirmed during manual review.";
  return "Marked unverified after manual review.";
}

function fieldValue(
  lead: {
    companyName: string;
    website: string | null;
    industry: string | null;
    location: string | null;
    contactName: string | null;
    contactTitle: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    linkedinUrl: string | null;
  },
  field: VerifiableField,
): string | null {
  const value = lead[field];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Records a human field check. Verification is never inferred from a provider
 * response: an admin must attest that the value was actually checked, and may
 * attach the evidence URL they used.
 */
export async function setLeadFieldVerification(input: {
  workspaceId: string;
  actorId: string;
  leadId: string;
  field: string;
  status: string;
  sourceUrl?: string | null;
  note?: string | null;
}): Promise<{ ok: true; overallStatus: string } | VerificationFailure> {
  const field = input.field.trim();
  const status = input.status.trim();

  if (!isVerifiableField(field)) {
    return { ok: false, code: "INVALID", message: "Choose a field that can be verified." };
  }
  if (!isFieldStatus(status)) {
    return {
      ok: false,
      code: "INVALID",
      message: "Choose Verified, Partially verified, or Unverified.",
    };
  }

  const source = normalizeSourceUrl(input.sourceUrl);
  if (!source.ok) return { ok: false, code: "INVALID", message: source.message };

  const note = input.note?.trim().slice(0, 500) || defaultNote(status);
  const lead = await db.lead.findFirst({
    where: { id: input.leadId, workspaceId: input.workspaceId, deletedAt: null },
    select: {
      id: true,
      companyName: true,
      website: true,
      industry: true,
      location: true,
      contactName: true,
      contactTitle: true,
      contactEmail: true,
      contactPhone: true,
      linkedinUrl: true,
    },
  });
  if (!lead) return { ok: false, code: "NOT_FOUND", message: "Lead not found." };

  const overallStatus = await db.$transaction(async (tx) => {
    await tx.leadFieldVerification.upsert({
      where: { leadId_field: { leadId: lead.id, field } },
      create: {
        leadId: lead.id,
        field,
        status,
        sourceUrl: source.url,
        note,
      },
      update: {
        status,
        sourceUrl: source.url,
        note,
        checkedAt: new Date(),
      },
    });

    const rows = await tx.leadFieldVerification.findMany({
      where: { leadId: lead.id },
      select: { field: true, status: true },
    });
    const statusByField = new Map(rows.map((row) => [row.field, row.status]));
    const populatedFields = VERIFIABLE_FIELDS.filter((candidate) =>
      fieldValue(lead, candidate),
    );
    const allPopulatedVerified = populatedFields.every(
      (candidate) => statusByField.get(candidate) === "VERIFIED",
    );
    const hasAnyCheck = rows.some((row) => row.status !== "UNVERIFIED");
    const overall = allPopulatedVerified
      ? "VERIFIED"
      : hasAnyCheck
        ? "PARTIAL"
        : "UNVERIFIED";

    await tx.lead.update({
      where: { id: lead.id },
      data: { verificationStatus: overall },
    });

    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        actorId: input.actorId,
        type: "FIELD_VERIFIED",
        detail: JSON.stringify({
          field,
          status,
          sourceUrl: source.url,
          note,
          overallStatus: overall,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "lead.field_verified",
        entityType: "Lead",
        entityId: lead.id,
        metadata: JSON.stringify({
          field,
          status,
          sourceUrl: source.url,
          overallStatus: overall,
        }),
      },
    });

    return overall;
  });

  return { ok: true, overallStatus };
}

export function fieldVerificationLabel(status: string): string {
  return FIELD_STATUS_LABELS[status] ?? status;
}
