/**
 * Pure lead-import logic: header mapping, field normalization, validation, and
 * cross-import identity. Kept free of Prisma/server imports so the mapping UI
 * and the unit tests can both use it.
 */

export type LeadImportFieldKey =
  | "companyName"
  | "domain"
  | "website"
  | "industry"
  | "location"
  | "employeeCount"
  | "revenueBand"
  | "description"
  | "contactName"
  | "contactTitle"
  | "contactEmail"
  | "contactPhone"
  | "linkedinUrl"
  | "sourceRecordId"
  | "sourceUrl"
  | "tags";

export type LeadImportField = {
  key: LeadImportFieldKey;
  label: string;
  required?: boolean;
  kind?: "text" | "email" | "url" | "integer" | "number" | "list";
  hint?: string;
  aliases: string[];
};

export const LEAD_IMPORT_FIELDS: LeadImportField[] = [
  {
    key: "companyName",
    label: "Company name",
    required: true,
    kind: "text",
    aliases: ["company", "company name", "organization", "organisation", "account", "business"],
  },
  { key: "domain", label: "Domain", kind: "text", aliases: ["domain", "company domain", "website domain"] },
  { key: "website", label: "Website", kind: "url", aliases: ["website", "url", "company website", "homepage"] },
  { key: "industry", label: "Industry", kind: "text", aliases: ["industry", "sector", "vertical"] },
  { key: "location", label: "Location", kind: "text", aliases: ["location", "city", "region", "country", "headquarters", "hq"] },
  { key: "employeeCount", label: "Employee count", kind: "integer", aliases: ["employees", "employee count", "headcount", "company size", "size"] },
  { key: "revenueBand", label: "Revenue band", kind: "text", aliases: ["revenue", "revenue band", "annual revenue", "arr"] },
  { key: "description", label: "Description", kind: "text", aliases: ["description", "about", "summary", "company description"] },
  { key: "contactName", label: "Contact name", kind: "text", aliases: ["contact", "contact name", "full name", "name", "person"] },
  { key: "contactTitle", label: "Contact title", kind: "text", aliases: ["title", "job title", "contact title", "role", "position"] },
  { key: "contactEmail", label: "Contact email", kind: "email", aliases: ["email", "contact email", "work email", "e-mail", "email address"] },
  { key: "contactPhone", label: "Contact phone", kind: "text", aliases: ["phone", "contact phone", "telephone", "mobile", "phone number"] },
  { key: "linkedinUrl", label: "LinkedIn URL", kind: "url", aliases: ["linkedin", "linkedin url", "linkedin profile"] },
  { key: "sourceRecordId", label: "Source record ID", kind: "text", aliases: ["record id", "source id", "source record id", "id", "provider id"] },
  { key: "sourceUrl", label: "Evidence URL", kind: "url", aliases: ["source url", "evidence", "evidence url", "profile url", "record url"] },
  { key: "tags", label: "Tags", kind: "list", aliases: ["tags", "labels", "segments"] },
];

export type LeadImportMapping = Partial<Record<LeadImportFieldKey, number>>;

export type NormalizedLeadRow = {
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
  sourceRecordId: string | null;
  sourceUrl: string | null;
  tags: string[];
  dedupeKey: string;
  /** Source line number, used in import reports. */
  line: number;
};

export type RowValidation =
  | { ok: true; row: NormalizedLeadRow }
  | { ok: false; errors: string[] };

export type RowIssue = {
  line: number;
  errors: string[];
};

export type PreparedImport = {
  rows: NormalizedLeadRow[];
  issues: RowIssue[];
  duplicateLines: number[];
};

const MAX_TEXT = 200;
const MAX_DESCRIPTION = 2000;
const MAX_TAGS = 10;

export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function autoDetectMapping(headers: string[]): LeadImportMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: LeadImportMapping = {};
  const used = new Set<number>();

  // Pass 1: exact header/alias matches. This prevents a broad alias such as
  // "contact" from claiming the "contact email" column before that field sees it.
  for (const field of LEAD_IMPORT_FIELDS) {
    const index = normalized.findIndex(
      (header, column) =>
        !used.has(column) &&
        field.aliases.some((alias) => normalizeHeader(alias) === header),
    );
    if (index !== -1) {
      mapping[field.key] = index;
      used.add(index);
    }
  }

  // Pass 2: containments, most specific alias first. A field only takes a column
  // when no stronger candidate exists, so "company name" cannot satisfy "name".
  const candidates: { field: LeadImportFieldKey; column: number; score: number }[] = [];
  for (const field of LEAD_IMPORT_FIELDS) {
    if (mapping[field.key] !== undefined) continue;
    normalized.forEach((header, column) => {
      if (!header || used.has(column)) return;
      let best = 0;
      for (const alias of field.aliases) {
        const normalizedAlias = normalizeHeader(alias);
        if (!normalizedAlias) continue;
        if (header === normalizedAlias) best = Math.max(best, normalizedAlias.length + 100);
        else if (header.includes(normalizedAlias) || normalizedAlias.includes(header)) {
          best = Math.max(best, normalizedAlias.length);
        }
      }
      if (best > 0) candidates.push({ field: field.key, column, score: best });
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    if (mapping[candidate.field] !== undefined || used.has(candidate.column)) continue;
    mapping[candidate.field] = candidate.column;
    used.add(candidate.column);
  }

  return mapping;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (!email) return null;
  return email;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  let candidate = value.trim().toLowerCase();
  if (!candidate) return null;
  candidate = candidate.replace(/^https?:\/\//, "").replace(/^www\./, "");
  candidate = candidate.split("/")[0]?.split("?")[0]?.split("#")[0] ?? "";
  candidate = candidate.replace(/\.$/, "");
  if (!candidate || candidate.includes(" ") || !candidate.includes(".")) return null;
  return candidate;
}

export function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function buildDedupeKey(input: {
  contactEmail?: string | null;
  domain?: string | null;
  companyName: string;
  location?: string | null;
}): string {
  const email = normalizeEmail(input.contactEmail);
  if (email) return `email:${email}`;
  const domain = normalizeDomain(input.domain);
  if (domain) return `domain:${domain}`;
  const company = input.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const location = (input.location ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `company:${company}|${location}`;
}

export function validateRow(
  values: string[],
  mapping: LeadImportMapping,
  line = 1,
): RowValidation {
  const errors: string[] = [];
  const read = (key: LeadImportFieldKey): string => {
    const index = mapping[key];
    if (index === undefined) return "";
    return values[index]?.trim() ?? "";
  };

  const text = (key: LeadImportFieldKey, max = MAX_TEXT): string | null => {
    const value = read(key);
    if (!value) return null;
    if (value.length > max) {
      errors.push(`${labelFor(key)} exceeds ${max} characters.`);
      return null;
    }
    return value;
  };

  const companyName = text("companyName");
  if (!companyName) {
    errors.push("Company name is required.");
  }

  const emailRaw = read("contactEmail");
  let contactEmail: string | null = null;
  if (emailRaw) {
    contactEmail = normalizeEmail(emailRaw);
    if (!contactEmail || !EMAIL_PATTERN.test(contactEmail) || contactEmail.length > 254) {
      errors.push("Contact email is not a valid address.");
    }
  }

  const websiteRaw = read("website");
  const website = websiteRaw ? normalizeUrl(websiteRaw) : null;
  if (websiteRaw && !website) errors.push("Website must be an http(s) URL.");

  const linkedinRaw = read("linkedinUrl");
  const linkedinUrl = linkedinRaw ? normalizeUrl(linkedinRaw) : null;
  if (linkedinRaw && !linkedinUrl) errors.push("LinkedIn URL must be an http(s) URL.");

  const sourceRaw = read("sourceUrl");
  const sourceUrl = sourceRaw ? normalizeUrl(sourceRaw) : null;
  if (sourceRaw && !sourceUrl) errors.push("Evidence URL must be an http(s) URL.");

  const domain =
    normalizeDomain(read("domain")) ?? normalizeDomain(websiteRaw) ?? null;

  const employeeRaw = read("employeeCount");
  let employeeCount: number | null = null;
  if (employeeRaw) {
    const match = employeeRaw.replace(/,/g, "").match(/\d+/);
    const parsed = match ? Number.parseInt(match[0], 10) : Number.NaN;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10_000_000) {
      errors.push("Employee count must be a whole number.");
    } else {
      employeeCount = parsed;
    }
  }

  const tags = read("tags")
    .split(/[;,|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length > MAX_TAGS) errors.push(`Use ${MAX_TAGS} tags or fewer.`);

  const description = text("description", MAX_DESCRIPTION);

  if (errors.length > 0 || !companyName) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    row: {
      companyName,
      domain,
      website,
      industry: text("industry"),
      location: text("location"),
      employeeCount,
      revenueBand: text("revenueBand"),
      description,
      contactName: text("contactName"),
      contactTitle: text("contactTitle"),
      contactEmail,
      contactPhone: text("contactPhone"),
      linkedinUrl,
      sourceRecordId: text("sourceRecordId"),
      sourceUrl,
      tags: tags.slice(0, MAX_TAGS),
      dedupeKey: buildDedupeKey({
        contactEmail,
        domain,
        companyName,
        location: read("location"),
      }),
      line,
    },
  };
}

/**
 * Validates every row, drops in-file duplicates, and reports per-line issues.
 * The caller still checks the database for rows that already exist.
 */
export function prepareImport(
  rows: { values: string[]; line: number }[],
  mapping: LeadImportMapping,
): PreparedImport {
  const issues: RowIssue[] = [];
  const prepared: NormalizedLeadRow[] = [];
  const seen = new Set<string>();
  const duplicateLines: number[] = [];

  for (const row of rows) {
    const result = validateRow(row.values, mapping, row.line);
    if (!result.ok) {
      issues.push({ line: row.line, errors: result.errors });
      continue;
    }
    if (seen.has(result.row.dedupeKey)) {
      duplicateLines.push(row.line);
      continue;
    }
    seen.add(result.row.dedupeKey);
    prepared.push(result.row);
  }

  return { rows: prepared, issues, duplicateLines };
}

export function labelFor(key: LeadImportFieldKey): string {
  return LEAD_IMPORT_FIELDS.find((field) => field.key === key)?.label ?? key;
}

export function mappingFromFormValues(
  values: Record<string, string | undefined>,
): LeadImportMapping {
  const mapping: LeadImportMapping = {};
  for (const field of LEAD_IMPORT_FIELDS) {
    const raw = values[`map_${field.key}`];
    if (raw === undefined || raw === "") continue;
    const index = Number.parseInt(raw, 10);
    if (Number.isInteger(index) && index >= 0) mapping[field.key] = index;
  }
  return mapping;
}

export function mappingIsUsable(mapping: LeadImportMapping): boolean {
  return mapping.companyName !== undefined;
}
