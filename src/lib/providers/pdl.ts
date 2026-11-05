/**
 * People Data Labs company search.
 *
 * Company search is used instead of person search so no contact data is
 * implied. Records keep the PDL company ID and a source URL.
 */

import { requestJson, trimTrailingSlash, type FetchLike } from "@/lib/providers/http";
import {
  asString,
  finalizeSourcedLead,
  isRecord,
  joinLocation,
  ProviderError,
  type LeadSearchQuery,
  type LeadSearchResult,
  type SourcedLead,
} from "@/lib/providers/types";

export const PDL_DEFAULT_BASE_URL = "https://api.peopledatalabs.com/v5";

export type PdlOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  now?: () => Date;
  signal?: AbortSignal;
  timeoutMs?: number;
};

function pdlLocation(value: unknown): string | null {
  if (typeof value === "string") return value.slice(0, 200);
  if (!isRecord(value)) return null;
  const named = asString(value.name);
  if (named) return named.slice(0, 200);
  return joinLocation([value.locality, value.region, value.country]);
}

export async function searchPdlLeads(
  query: LeadSearchQuery,
  options: PdlOptions,
): Promise<LeadSearchResult> {
  if (!options.apiKey) {
    throw new ProviderError("PDL_API_KEY is not set.", {
      code: "CONFIGURATION",
      retryable: false,
    });
  }

  const must: Record<string, unknown>[] = [
    { match: { industry: query.industry } },
    { match: { "location.country": query.region } },
  ];
  if (query.companySize?.trim()) {
    must.push({ term: { size: query.companySize.trim() } });
  }

  const body = await requestJson({
    provider: "People Data Labs",
    url: `${trimTrailingSlash(options.baseUrl ?? PDL_DEFAULT_BASE_URL)}/company/search`,
    method: "POST",
    headers: { "X-Api-Key": options.apiKey },
    body: {
      query: { bool: { must } },
      size: Math.max(1, Math.min(100, query.limit)),
    },
    timeoutMs: options.timeoutMs ?? 30_000,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });

  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new ProviderError("People Data Labs response did not include a data array.", {
      code: "INVALID_RESPONSE",
      retryable: false,
    });
  }

  const now = options.now ?? (() => new Date());
  const records: SourcedLead[] = [];
  let skipped = 0;

  for (const item of body.data) {
    if (!isRecord(item)) {
      skipped += 1;
      continue;
    }

    const record = finalizeSourcedLead({
      provider: "pdl",
      companyName: item.name,
      domain: item.website,
      website: item.website,
      industry: item.industry,
      location: pdlLocation(item.location),
      employeeCount: item.employee_count,
      description: item.summary,
      contactName: null,
      contactTitle: null,
      contactEmail: null,
      contactPhone: null,
      linkedinUrl: item.linkedin_url,
      sourceRecordId: item.id,
      sourceUrl: asString(item.linkedin_url) ?? asString(item.website),
      retrievedAt: now(),
      tags: item.tags,
    });

    if (record) records.push(record);
    else skipped += 1;
  }

  return {
    records,
    skipped,
    notes:
      skipped > 0
        ? [`${skipped} PDL record(s) lacked a company name or record ID and were skipped.`]
        : [],
  };
}
