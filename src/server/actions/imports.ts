"use server";

import { redirect } from "next/navigation";

import { checkRateLimit } from "@/lib/auth/rate-limit";
import { RATE_LIMITS, rateLimitMessage } from "@/lib/auth/rate-limits";
import { getAuthContext, roleAtLeast } from "@/lib/auth/workspace";
import { formString, type FormState } from "@/lib/form";
import { LEAD_IMPORT_FIELDS, mappingIsUsable, type LeadImportMapping } from "@/lib/leads/import";
import { importLeadsCsv } from "@/server/services/imports";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function readMapping(formData: FormData): LeadImportMapping {
  const mapping: LeadImportMapping = {};
  for (const field of LEAD_IMPORT_FIELDS) {
    const raw = formString(formData, `map_${field.key}`);
    if (!raw) continue;
    const index = Number.parseInt(raw, 10);
    if (Number.isInteger(index) && index >= 0) mapping[field.key] = index;
  }
  return mapping;
}

export async function importLeadsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }
  if (!roleAtLeast(context.role, "MEMBER")) {
    return { status: "error", message: "You do not have permission to import leads." };
  }

  const limit = await checkRateLimit(
    `import:${context.user.id}`,
    RATE_LIMITS.csvImport.limit,
    RATE_LIMITS.csvImport.windowSeconds,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose a CSV file to import." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { status: "error", message: "The file is larger than 8 MB. Split it into smaller files." };
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return { status: "error", message: "Upload a file with a .csv extension." };
  }

  const mapping = readMapping(formData);
  if (!mappingIsUsable(mapping)) {
    return {
      status: "error",
      fieldErrors: { mapping: ["Map the company name column before importing."] },
    };
  }

  if (formString(formData, "rightsConfirmed") !== "on") {
    return {
      status: "error",
      message: "Confirm that you hold the rights to use this data before importing.",
    };
  }

  const content = await file.text();
  const result = await importLeadsCsv({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    filename: file.name.slice(0, 200),
    content,
    mapping,
    rightsConfirmed: true,
  });

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  redirect(`/leads/imports/${result.importId}?created=1`);
}
