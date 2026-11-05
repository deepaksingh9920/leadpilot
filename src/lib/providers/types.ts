/**
 * Shared provider contracts.
 *
 * Adapters may only return fields the provider actually supplied. Anything
 * missing stays empty; nothing is inferred from a name, domain, or pattern.
 * These modules are pure so the unit tests can exercise request shaping and
 * normalization without a database or the job queue.
 */

import {
  buildDedupeKey,
  normalizeDomain,
  normalizeEmail,
  normalizeUrl,
} from "@/lib/leads/import";

export const LEAD_SOURCE_PROVIDERS = ["apollo", "pdl", "google_places"] as const;

export type LeadSourceProviderId = (typeof LEAD_SOURCE_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<LeadSourceProviderId, string> = {
  apollo: "Apollo",
  pdl: "People Data Labs",
  google_places: "Google Places",
};

export const PROVIDER_TERMS_URLS: Record<LeadSourceProviderId, string> = {
  apollo: "https://www.apollo.io/terms",
  pdl: "https://www.peopledatalabs.com/terms-of-service",
  google_places: "https://cloud.google.com/maps-platform/terms",
};

export const PROVIDER_LICENSE_NOTES: Record<LeadSourceProviderId, string> = {
  apollo:
    "Records returned by the workspace's own Apollo API key. The workspace operator is responsible for confirming that its Apollo plan permits prospecting use.",
  pdl: "Records returned by the workspace's own People Data Labs API key. The workspace operator is responsible for confirming permissible use under its contract.",
  google_places:
    "Business listings returned by Google Places API (New). Business contact details only; no personal email addresses. Google caching and display terms apply.",
};

export type LeadSearchQuery = {
  industry: string;
  region: string;
  companySize?: string | null;
  targetCustomerType?: string | null;
  limit: number;
};

export type SourcedLead = {
  provider: LeadSourceProviderId;
  companyName: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  location: string | null;
  employeeCount: number | null;
  revenueBand: string | null;
  description: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  linkedinUrl: string | null;
  sourceRecordId: string;
  sourceUrl: string | null;
  retrievedAt: Date;
  dedupeKey: string;
  tags: string[];
};

export type LeadSearchResult = {
  records: SourcedLead[];
  /** Provider rows that could not be attributed to a company/record ID. */
  skipped: number;
  notes: string[];
};

export type ProviderErrorCode =
  | "CONFIGURATION"
  | "AUTH"
  | "RATE_LIMIT"
  | "UPSTREAM"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "HTTP";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    message: string,
    options: {
      code: ProviderErrorCode;
      retryable: boolean;
      status?: number;
      retryAfterSeconds?: number;
    },
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function integer(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value >= 0 && value <= 10_000_000 ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.replace(/,/g, ""), 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000) return parsed;
  }
  return null;
}

function stringList(value: unknown, max = 10): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const cleaned = item.trim().slice(0, 80);
    if (cleaned) seen.add(cleaned);
    if (seen.size >= max) break;
  }
  return [...seen];
}

export type SourcedLeadInput = {
  provider: LeadSourceProviderId;
  companyName?: unknown;
  domain?: unknown;
  website?: unknown;
  industry?: unknown;
  location?: unknown;
  employeeCount?: unknown;
  revenueBand?: unknown;
  description?: unknown;
  contactName?: unknown;
  contactTitle?: unknown;
  contactEmail?: unknown;
  contactPhone?: unknown;
  linkedinUrl?: unknown;
  sourceRecordId?: unknown;
  sourceUrl?: unknown;
  retrievedAt: Date;
  tags?: unknown;
};

/**
 * Drops records that cannot be attributed and normalizes the rest. A record is
 * usable only when the provider returned both a company name and a record ID.
 */
export function finalizeSourcedLead(input: SourcedLeadInput): SourcedLead | null {
  const companyName = text(input.companyName, 200);
  const sourceRecordId = text(input.sourceRecordId, 200);
  if (!companyName || !sourceRecordId) return null;

  const website = normalizeUrl(typeof input.website === "string" ? input.website : null);
  const domain = normalizeDomain(
    typeof input.domain === "string" ? input.domain : null,
  ) ?? normalizeDomain(website);

  const rawEmail = normalizeEmail(
    typeof input.contactEmail === "string" ? input.contactEmail : null,
  );
  const contactEmail =
    rawEmail && rawEmail.length <= 254 && EMAIL_PATTERN.test(rawEmail) ? rawEmail : null;

  return {
    provider: input.provider,
    companyName,
    domain,
    website,
    industry: text(input.industry, 200),
    location: text(input.location, 200),
    employeeCount: integer(input.employeeCount),
    revenueBand: text(input.revenueBand, 80),
    description: text(input.description, 2000),
    contactName: text(input.contactName, 200),
    contactTitle: text(input.contactTitle, 200),
    contactEmail,
    contactPhone: text(input.contactPhone, 80),
    linkedinUrl: normalizeUrl(
      typeof input.linkedinUrl === "string" ? input.linkedinUrl : null,
    ),
    sourceRecordId,
    sourceUrl: normalizeUrl(
      typeof input.sourceUrl === "string" ? input.sourceUrl : null,
    ),
    retrievedAt: input.retrievedAt,
    dedupeKey: buildDedupeKey({
      contactEmail,
      domain,
      companyName,
      location: text(input.location, 200),
    }),
    tags: stringList(input.tags),
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function joinLocation(parts: unknown[]): string | null {
  const cleaned = parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(", ").slice(0, 200) : null;
}
