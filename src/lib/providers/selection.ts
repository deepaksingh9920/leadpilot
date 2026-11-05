/**
 * Chooses which lead-source adapter is active.
 *
 * `PRIMARY_LEAD_SOURCE` is authoritative when it names an API provider. When it
 * is unset (or `csv`), a single configured API key is used; multiple keys are
 * ambiguous and require an explicit choice. Nothing is guessed silently.
 */

import {
  LEAD_SOURCE_PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_TERMS_URLS,
  type LeadSourceProviderId,
} from "@/lib/providers/types";

export type LeadSourceEnvValues = {
  primary?: string | null;
  apolloKey?: string | null;
  pdlKey?: string | null;
  googlePlacesKey?: string | null;
  apolloTermsUrl?: string | null;
  pdlTermsUrl?: string | null;
  googlePlacesTermsUrl?: string | null;
};

export type SelectedLeadSource = {
  provider: LeadSourceProviderId;
  label: string;
  apiKey: string;
  termsUrl: string;
};

export type LeadSourceSelection =
  | { ok: true; source: SelectedLeadSource }
  | {
      ok: false;
      reason: "NONE" | "MISSING_KEY" | "AMBIGUOUS" | "INVALID";
      message: string;
    };

const KEY_BY_PROVIDER: Record<LeadSourceProviderId, keyof LeadSourceEnvValues> = {
  apollo: "apolloKey",
  pdl: "pdlKey",
  google_places: "googlePlacesKey",
};

const TERMS_BY_PROVIDER: Record<LeadSourceProviderId, keyof LeadSourceEnvValues> = {
  apollo: "apolloTermsUrl",
  pdl: "pdlTermsUrl",
  google_places: "googlePlacesTermsUrl",
};

export function isLeadSourceProvider(value: string): value is LeadSourceProviderId {
  return (LEAD_SOURCE_PROVIDERS as readonly string[]).includes(value);
}

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function selectLeadSource(values: LeadSourceEnvValues): LeadSourceSelection {
  const primary = clean(values.primary)?.toLowerCase();
  const keys = new Map<LeadSourceProviderId, string>();
  for (const provider of LEAD_SOURCE_PROVIDERS) {
    const key = clean(values[KEY_BY_PROVIDER[provider]] as string | null | undefined);
    if (key) keys.set(provider, key);
  }

  const chosen: LeadSourceProviderId | undefined = (() => {
    if (primary && isLeadSourceProvider(primary)) return primary;
    if (!primary || primary === "csv" || primary === "manual") {
      const available = [...keys.keys()];
      if (available.length === 1) return available[0];
      if (available.length > 1) return undefined;
      return undefined;
    }
    return undefined;
  })();

  if (primary && primary !== "csv" && primary !== "manual" && !isLeadSourceProvider(primary)) {
    return {
      ok: false,
      reason: "INVALID",
      message: `PRIMARY_LEAD_SOURCE="${primary}" is not a supported lead source. Use apollo, pdl, google_places, or csv.`,
    };
  }

  const available = [...keys.keys()];
  if (!chosen && available.length > 1) {
    return {
      ok: false,
      reason: "AMBIGUOUS",
      message:
        "Multiple lead-source API keys are configured. Set PRIMARY_LEAD_SOURCE to apollo, pdl, or google_places to choose one.",
    };
  }

  if (!chosen) {
    return {
      ok: false,
      reason: "NONE",
      message:
        "No lead-source API is configured. Set PRIMARY_LEAD_SOURCE and the matching API key, or import leads from CSV.",
    };
  }

  const apiKey = keys.get(chosen);
  if (!apiKey) {
    return {
      ok: false,
      reason: "MISSING_KEY",
      message: `PRIMARY_LEAD_SOURCE is ${chosen}, but ${keyName(chosen)} is not set.`,
    };
  }

  const terms = clean(values[TERMS_BY_PROVIDER[chosen]] as string | null | undefined);
  return {
    ok: true,
    source: {
      provider: chosen,
      label: PROVIDER_LABELS[chosen],
      apiKey,
      termsUrl: terms ?? PROVIDER_TERMS_URLS[chosen],
    },
  };
}

export function keyName(provider: LeadSourceProviderId): string {
  if (provider === "apollo") return "APOLLO_API_KEY";
  if (provider === "pdl") return "PDL_API_KEY";
  return "GOOGLE_PLACES_API_KEY";
}
