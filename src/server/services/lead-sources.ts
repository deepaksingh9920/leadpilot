import "server-only";

import { env } from "@/lib/env";
import { searchApolloLeads } from "@/lib/providers/apollo";
import { searchGooglePlacesLeads } from "@/lib/providers/google-places";
import { searchPdlLeads } from "@/lib/providers/pdl";
import type { FetchLike } from "@/lib/providers/http";
import {
  PROVIDER_LABELS,
  PROVIDER_LICENSE_NOTES,
  PROVIDER_TERMS_URLS,
  type LeadSearchQuery,
  type LeadSearchResult,
  type LeadSourceProviderId,
} from "@/lib/providers/types";
import { readLeadSourceIntegration } from "@/server/services/integrations";

export type ActiveLeadSource = {
  provider: LeadSourceProviderId;
  label: string;
  apiKey: string;
  termsUrl: string;
  licenseNote: string;
  baseUrl: string;
  /** Where the credential came from; used by the Integrations page. */
  credentialSource: "workspace" | "server";
};

export type ActiveLeadSourceResult =
  | { ok: true; source: ActiveLeadSource }
  | { ok: false; message: string };

function defaultBaseUrl(provider: LeadSourceProviderId): string {
  if (provider === "apollo") return env.apolloBaseUrl;
  if (provider === "pdl") return env.pdlBaseUrl;
  return env.googlePlacesBaseUrl;
}

function fromEnv(): ActiveLeadSourceResult {
  const selection = env.leadSourceSelection;
  if (!selection.ok) return { ok: false, message: selection.message };

  const { provider } = selection.source;
  return {
    ok: true,
    source: {
      provider,
      label: PROVIDER_LABELS[provider],
      apiKey: selection.source.apiKey,
      termsUrl: selection.source.termsUrl,
      licenseNote: PROVIDER_LICENSE_NOTES[provider],
      baseUrl: defaultBaseUrl(provider),
      credentialSource: "server",
    },
  };
}

/**
 * Workspace credentials win over deployment defaults. A stored but unreadable
 * record fails closed: it does not silently fall back to the operator's key,
 * because that would send a workspace's searches through someone else's
 * provider account.
 */
export async function getActiveLeadSource(
  workspaceId?: string,
): Promise<ActiveLeadSourceResult> {
  if (workspaceId) {
    const stored = await readLeadSourceIntegration(workspaceId);
    if (stored.state === "error") return { ok: false, message: stored.message };
    if (stored.state === "ok") {
      const { provider, apiKey, baseUrl } = stored.credentials;
      return {
        ok: true,
        source: {
          provider,
          label: PROVIDER_LABELS[provider],
          apiKey,
          termsUrl: PROVIDER_TERMS_URLS[provider],
          licenseNote: PROVIDER_LICENSE_NOTES[provider],
          baseUrl: baseUrl ?? defaultBaseUrl(provider),
          credentialSource: "workspace",
        },
      };
    }
  }

  return fromEnv();
}

export async function getLeadSourceStatus(workspaceId?: string): Promise<{
  configured: boolean;
  provider: LeadSourceProviderId | null;
  label: string | null;
  message: string | null;
}> {
  const active = await getActiveLeadSource(workspaceId);
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
    workspaceId?: string;
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    now?: () => Date;
    timeoutMs?: number;
  },
): Promise<{ provider: LeadSourceProviderId; label: string; termsUrl: string; result: LeadSearchResult }> {
  const active = await getActiveLeadSource(options?.workspaceId);
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
