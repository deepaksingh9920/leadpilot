import { serializeCsv } from "@/lib/csv";
import { canExportLeads, getAuthContext } from "@/lib/auth/workspace";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { RATE_LIMITS } from "@/lib/auth/rate-limits";
import { writeAuditLog } from "@/lib/auth/audit";
import { getLeadsForExport } from "@/server/services/leads";
import { getWorkspaceLimits, releaseUsage, reserveUsage } from "@/server/services/workspaces";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "Company",
  "Domain",
  "Website",
  "Industry",
  "Location",
  "Employees",
  "Revenue band",
  "Contact name",
  "Contact title",
  "Contact email",
  "Contact phone",
  "LinkedIn",
  "Status",
  "Score",
  "Verification",
  "Source",
  "Source record ID",
  "Evidence URL",
  "Retrieved at",
  "Tags",
  "Created at",
  "Notes",
];

export async function GET() {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!canExportLeads(context.role)) {
    return Response.json(
      { error: "You do not have permission to export leads." },
      { status: 403 },
    );
  }

  const limit = await checkRateLimit(
    `lead-export:${context.user.id}`,
    RATE_LIMITS.leadExport.limit,
    RATE_LIMITS.leadExport.windowSeconds,
  );
  if (!limit.allowed) {
    return Response.json(
      {
        error: `Too many exports. Try again in about ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const limits = await getWorkspaceLimits(context.workspace.id);
  const exportLimit = limits.exports_per_month ?? 0;

  const reservation = await db.$transaction(async (tx) =>
    reserveUsage(tx, context.workspace!.id, "exports_per_month", 1, exportLimit),
  );
  if (!reservation.ok) {
    return Response.json({ error: reservation.reason }, { status: 429 });
  }

  try {
    const leads = await getLeadsForExport(context.workspace.id);
    const rows = leads.map((lead) => {
      const verified = lead.verifications.filter((row) => row.status === "VERIFIED").length;
      const partial = lead.verifications.filter((row) => row.status === "PARTIAL").length;
      return [
        lead.companyName,
        lead.domain ?? "",
        lead.website ?? "",
        lead.industry ?? "",
        lead.location ?? "",
        lead.employeeCount === null ? "" : String(lead.employeeCount),
        lead.revenueBand ?? "",
        lead.contactName ?? "",
        lead.contactTitle ?? "",
        lead.contactEmail ?? "",
        lead.contactPhone ?? "",
        lead.linkedinUrl ?? "",
        lead.status,
        String(lead.score),
        `${lead.verificationStatus} (${verified} verified, ${partial} partial)`,
        lead.source?.name ?? "",
        lead.sourceRecordId ?? "",
        lead.sourceUrl ?? "",
        lead.retrievedAt ? lead.retrievedAt.toISOString() : "",
        lead.tags,
        lead.createdAt.toISOString(),
        lead.notes ?? "",
      ];
    });

    const csv = serializeCsv(HEADERS, rows);
    const filename = `leadpilot-leads-${new Date().toISOString().slice(0, 10)}.csv`;

    await writeAuditLog({
      workspaceId: context.workspace.id,
      actorId: context.user.id,
      action: "leads.exported",
      entityType: "Lead",
      metadata: { count: leads.length, filename },
    });

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Lead export failed", error);
    await db.$transaction(async (tx) =>
      releaseUsage(tx, context.workspace!.id, "exports_per_month", 1),
    );
    return Response.json({ error: "The export could not be generated." }, { status: 500 });
  }
}
