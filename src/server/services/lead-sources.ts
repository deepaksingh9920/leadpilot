import "server-only";

import { env } from "@/lib/env";
import { searchApolloLeads } from "@/lib/providers/apollo";
import { searchGooglePlacesLeads } from "@/lib/providers/google-places";
import { searchPdlLeads } from "@/lib/providers/pdl";
import type { FetchLike } from "@/lib/providers/http";
import {
  PROVIDER_LABELS,
  PROVIDER_LICENSE_NOTES,
  type LeadSearchQuery,
  type LeadSearchResult,
  type LeadSourceProviderId,
} from "@/lib/providers/types";

export type ActiveLeadSource = {
  provider: LeadSourceProviderId;
  label: string;
  apiKey: string;
  termsUrl: string;
  licenseNote: string;
  baseUrl: string;
};

export type ActiveLeadSourceResult =
  | { ok: true; source: ActiveLeadSource }
  | { ok: false; message: string };

export function getActiveLeadSource(): ActiveLeadSourceResult {
  const selection = env.leadSourceSelection;
  if (!selection.ok) return { ok: false, message: selection.message };

  const { provider } = selection.source;
  const baseUrl =
    provider === "apollo"
      ? env.apolloBaseUrl
      : provider === "pdl"
        ? env.pdlBaseUrl
        : env.googlePlacesBaseUrl;

  return {
    ok: true,
    source: {
      provider,
      label: PROVIDER_LABELS[provider],
      apiKey: selection.source.apiKey,
      termsUrl: selection.source.termsUrl,
      licenseNote: PROVIDER_LICENSE_NOTES[provider],
      baseUrl,
    },
  };
}

export function getLeadSourceStatus(): {
  configured: boolean;
  provider: LeadSourceProviderId | null;
  label: string | null;
  message: string | null;
} {
  const active = getActiveLeadSource();
  if (!active.ok) {
    return { configured: false, provider: null, label: null, message: active.message };
  }
  return {
    configured: true,
    provider: active.source.provider,
    label: active.source.label,
    message: null,
  };
}

export async function searchPrimaryLeadSource(
  query: LeadSearchQuery,
  options?: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    now?: () => Date;
    timeoutMs?: number;
  },
): Promise<{ provider: LeadSourceProviderId; label: string; termsUrl: string; result: LeadSearchResult }> {
  const active = getActiveLeadSource();
  if (!active.ok) {
    throw new Error(active.message);
  }

  const { source } = active;
  const common = {
    apiKey: source.apiKey,
    baseUrl: source.baseUrl,
    fetchImpl: options?.fetchImpl,
    signal: options?.signal,
    now: options?.now,
    timeoutMs: options?.timeoutMs,
  };

  const result =
    source.provider === "apollo"
      ? await searchApolloLeads(query, common)
      : source.provider === "pdl"
        ? await searchPdlLeads(query, common)
        : await searchGooglePlacesLeads(query, common);

  return {
    provider: source.provider,
    label: source.label,
    termsUrl: source.termsUrl,
    result,
  };
}
