/**
 * Google Places API (New) text search.
 *
 * Business listings only. Google does not return personal emails, and this
 * adapter never derives one. Permanent and temporary closures are skipped.
 */

import { requestJson, trimTrailingSlash, type FetchLike } from "@/lib/providers/http";
import {
  finalizeSourcedLead,
  isRecord,
  ProviderError,
  type LeadSearchQuery,
  type LeadSearchResult,
  type SourcedLead,
} from "@/lib/providers/types";

export const GOOGLE_PLACES_DEFAULT_BASE_URL = "https://places.googleapis.com/v1";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.businessStatus",
  "places.googleMapsUri",
].join(",");

export type GooglePlacesOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  now?: () => Date;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function searchGooglePlacesLeads(
  query: LeadSearchQuery,
  options: GooglePlacesOptions,
): Promise<LeadSearchResult> {
  if (!options.apiKey) {
    throw new ProviderError("GOOGLE_PLACES_API_KEY is not set.", {
      code: "CONFIGURATION",
      retryable: false,
    });
  }

  const body = await requestJson({
    provider: "Google Places",
    url: `${trimTrailingSlash(options.baseUrl ?? GOOGLE_PLACES_DEFAULT_BASE_URL)}/places:searchText`,
    method: "POST",
    headers: {
      "X-Goog-Api-Key": options.apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: {
      textQuery: `${query.industry} in ${query.region}`,
      maxResultCount: Math.max(1, Math.min(20, query.limit)),
    },
    timeoutMs: options.timeoutMs ?? 30_000,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });

  if (!isRecord(body) || !Array.isArray(body.places)) {
    throw new ProviderError("Google Places response did not include a places array.", {
      code: "INVALID_RESPONSE",
      retryable: false,
    });
  }

  const now = options.now ?? (() => new Date());
  const records: SourcedLead[] = [];
  let skipped = 0;
  let closed = 0;

  for (const item of body.places) {
    if (!isRecord(item)) {
      skipped += 1;
      continue;
    }

    const status = typeof item.businessStatus === "string" ? item.businessStatus : null;
    if (status === "CLOSED_PERMANENTLY" || status === "CLOSED_TEMPORARILY") {
      closed += 1;
      continue;
    }

    const displayName = isRecord(item.displayName) ? item.displayName.text : null;
    const primaryType = isRecord(item.primaryTypeDisplayName)
      ? item.primaryTypeDisplayName.text
      : null;
    const types = Array.isArray(item.types)
      ? item.types.filter((type): type is string => typeof type === "string")
      : [];

    const record = finalizeSourcedLead({
      provider: "google_places",
      companyName: displayName,
      domain: item.websiteUri,
      website: item.websiteUri,
      industry: primaryType ?? types[0] ?? null,
      location: item.formattedAddress,
      employeeCount: null,
      description: null,
      contactName: null,
      contactTitle: null,
      contactEmail: null,
      contactPhone: item.nationalPhoneNumber ?? item.internationalPhoneNumber,
      linkedinUrl: null,
      sourceRecordId: item.id,
      sourceUrl: item.googleMapsUri ?? item.websiteUri,
      retrievedAt: now(),
      tags: types,
    });

    if (record) records.push(record);
    else skipped += 1;
  }

  const notes: string[] = [];
  if (skipped > 0) {
    notes.push(`${skipped} Places record(s) lacked a business name or place ID and were skipped.`);
  }
  if (closed > 0) notes.push(`${closed} permanently or temporarily closed listing(s) were skipped.`);

  return { records, skipped: skipped + closed, notes };
}
