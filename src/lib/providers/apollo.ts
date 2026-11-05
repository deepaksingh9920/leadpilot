/**
 * Apollo.io people search.
 *
 * The adapter sends the workspace's ICP filters, then keeps only fields Apollo
 * returned. Apollo records without an organization name or person ID are
 * skipped rather than repaired.
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

export const APOLLO_DEFAULT_BASE_URL = "https://api.apollo.io/v1";

export type ApolloOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  now?: () => Date;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** Converts "51-200" or "201–500" into Apollo's "51,200" range syntax. */
export function apolloSizeRange(value: string | null | undefined): string | null {
  if (!value) return null;
  const numbers = value.replace(/,/g, "").match(/\d+/g);
  if (!numbers || numbers.length === 0) return null;
  if (numbers.length >= 2) return `${numbers[0]},${numbers[1]}`;
  if (value.includes("+")) return `${numbers[0]},1000000`;
  return null;
}

function splitTerms(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...new Set(
    value
      .split(/[;,|]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10),
  )];
}

export async function searchApolloLeads(
  query: LeadSearchQuery,
  options: ApolloOptions,
): Promise<LeadSearchResult> {
  if (!options.apiKey) {
    throw new ProviderError("APOLLO_API_KEY is not set.", {
      code: "CONFIGURATION",
      retryable: false,
    });
  }

  const sizeRange = apolloSizeRange(query.companySize);
  const titles = splitTerms(query.targetCustomerType);
  const body = await requestJson({
    provider: "Apollo",
    url: `${trimTrailingSlash(options.baseUrl ?? APOLLO_DEFAULT_BASE_URL)}/mixed_people/api_search`,
    method: "POST",
    headers: { "x-api-key": options.apiKey },
    body: {
      page: 1,
      per_page: Math.max(1, Math.min(100, query.limit)),
      q_organization_keyword_tags: [query.industry],
      person_locations: [query.region],
      ...(sizeRange ? { organization_num_employees_ranges: [sizeRange] } : {}),
      ...(titles.length > 0 ? { person_titles: titles } : {}),
    },
    timeoutMs: options.timeoutMs ?? 30_000,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });

  if (!isRecord(body) || !Array.isArray(body.people)) {
    throw new ProviderError("Apollo response did not include a people array.", {
      code: "INVALID_RESPONSE",
      retryable: false,
    });
  }

  const now = options.now ?? (() => new Date());
  const records: SourcedLead[] = [];
  let skipped = 0;

  for (const item of body.people) {
    if (!isRecord(item)) {
      skipped += 1;
      continue;
    }
    const organization = isRecord(item.organization) ? item.organization : {};
    const phoneNumbers = Array.isArray(item.phone_numbers) ? item.phone_numbers : [];
    const firstPhone = phoneNumbers.find(
      (entry) => isRecord(entry) && typeof entry.sanitized_number === "string",
    );
    const phone =
      isRecord(firstPhone) && typeof firstPhone.sanitized_number === "string"
        ? firstPhone.sanitized_number
        : typeof item.phone === "string"
          ? item.phone
          : null;

    const record = finalizeSourcedLead({
      provider: "apollo",
      companyName: organization.name ?? item.organization_name,
      domain: organization.primary_domain,
      website: organization.website_url,
      industry: organization.industry,
      location: joinLocation([organization.city, organization.state, organization.country]),
      employeeCount: organization.estimated_num_employees,
      description: organization.short_description ?? organization.seo_description,
      contactName: item.name,
      contactTitle: item.title,
      contactEmail: item.email,
      contactPhone: phone,
      linkedinUrl: item.linkedin_url,
      sourceRecordId: item.id,
      sourceUrl:
        asString(item.linkedin_url) ??
        asString(organization.linkedin_url) ??
        asString(organization.website_url),
      retrievedAt: now(),
      tags: organization.keywords,
    });

    if (record) records.push(record);
    else skipped += 1;
  }

  return {
    records,
    skipped,
    notes:
      skipped > 0
        ? [`${skipped} Apollo record(s) lacked a company name or record ID and were skipped.`]
        : [],
  };
}
