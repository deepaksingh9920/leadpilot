import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  Search,
  Upload,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/auth/workspace";
import { formatDate } from "@/lib/utils";
import {
  getLeadsPage,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_STATUSES,
} from "@/server/services/leads";

export const metadata = { title: "Leads" };

const STATUS_TONES: Record<string, "brand" | "success" | "warning" | "danger" | "neutral"> = {
  NEW: "brand",
  QUALIFIED: "success",
  CONTACTED: "warning",
  NURTURE: "neutral",
  DISQUALIFIED: "danger",
  CONVERTED: "success",
};

const VERIFICATION_TONES: Record<string, "success" | "warning" | "neutral"> = {
  VERIFIED: "success",
  PARTIAL: "warning",
  UNVERIFIED: "neutral",
};

const SORTABLE = [
  { key: "company", label: "Company" },
  { key: "score", label: "Score" },
  { key: "status", label: "Status" },
  { key: "added", label: "Added" },
] as const;

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const params = await searchParams;
  const status = first(params.status);
  const verification = first(params.verification);
  const query = first(params.q);
  const sort = first(params.sort);
  const dir = first(params.dir);
  const page = parsePage(params.page);
  const deleted = first(params.deleted) === "1";

  const result = await getLeadsPage(context.workspace.id, {
    status,
    verification,
    query,
    page,
    sort,
    dir,
  });
  const filtered = Boolean(status || verification || query);

  function href(overrides: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      status,
      verification,
      q: query,
      sort,
      dir,
    };
    for (const [key, value] of Object.entries({ ...base, ...overrides })) {
      if (value) next.set(key, value);
    }
    const queryString = next.toString();
    return `/leads${queryString ? `?${queryString}` : ""}`;
  }

  function sortHref(key: string) {
    const nextDir = result.sort === key && result.dir === "asc" ? "desc" : "asc";
    return href({ sort: key, dir: nextDir, page: undefined });
  }

  const tabs = [
    { key: undefined, label: "All", count: result.totalAll },
    ...LEAD_STATUSES.map((key) => ({
      key,
      label: LEAD_STATUS_LABELS[key],
      count: result.statusCounts[key] ?? 0,
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Leads</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Every row must come from a permitted source and keep its evidence. Fields without
            evidence stay empty rather than being inferred.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/leads/import" className={buttonClasses({ size: "sm" })}>
            <Upload className="size-4" aria-hidden="true" />
            Import CSV
          </Link>
          <a
            href="/api/leads/export"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <Download className="size-4" aria-hidden="true" />
            Export
          </a>
          <Link
            href="/integrations"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            <Database className="size-4" aria-hidden="true" />
            Sources
          </Link>
        </div>
      </div>

      {deleted ? (
        <Alert tone="success" title="Lead removed">
          The lead was soft-deleted and is excluded from lists, exports, and campaign counts. The
          audit log still records who removed it.
        </Alert>
      ) : null}

      <Card>
        <div className="border-b border-line p-3">
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((tab) => {
              const active = (status ?? undefined) === tab.key;
              return (
                <Link
                  key={tab.label}
                  href={href({ status: tab.key, page: undefined })}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                    active
                      ? "bg-ink text-white"
                      : "text-muted hover:bg-ink/5 hover:text-ink"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      active ? "bg-white/15 text-white" : "bg-canvas text-muted"
                    }`}
                  >
                    {tab.count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="border-b border-line p-3">
          <form action="/leads" method="get" className="flex flex-col gap-2 sm:flex-row">
            {status ? <input type="hidden" name="status" value={status} /> : null}
            {verification ? (
              <input type="hidden" name="verification" value={verification} />
            ) : null}
            {sort ? <input type="hidden" name="sort" value={sort} /> : null}
            {dir ? <input type="hidden" name="dir" value={dir} /> : null}
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                name="q"
                defaultValue={query ?? ""}
                placeholder="Search company, domain, contact, or email"
                className="input h-10 pl-9"
                aria-label="Search leads"
              />
            </div>
            <select
              name="verification"
              defaultValue={verification ?? ""}
              className="input h-10 sm:w-48"
              aria-label="Filter by verification"
            >
              <option value="">Any verification</option>
              {VERIFICATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {VERIFICATION_LABELS[value]}
                </option>
              ))}
            </select>
            <button type="submit" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Apply
            </button>
            {filtered ? (
              <Link href="/leads" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                Clear
              </Link>
            ) : null}
          </form>
        </div>

        {result.leads.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <Database className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-lg font-semibold text-ink">
              {filtered ? "No leads match these filters" : "No leads yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              {filtered
                ? "Try a different status, verification level, or search term. Filters only apply to leads already stored in this workspace."
                : "Import a CSV of companies you have the right to contact, or connect a permitted source and let an agent store attributed records. LeadPilot does not seed example leads."}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {filtered ? (
                <Link href="/leads" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Clear filters
                </Link>
              ) : (
                <Link href="/leads/import" className={buttonClasses({ size: "sm" })}>
                  <Upload className="size-4" aria-hidden="true" />
                  Import your first CSV
                </Link>
              )}
              <Link href="/integrations" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                Check source configuration
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="mx-auto mt-6 max-w-md rounded-xl bg-canvas px-4 py-3 text-[11px] leading-relaxed text-muted">
              Imports are deduplicated by email, domain, then company + location, and every row is
              recorded with its source and evidence URL.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[960px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-canvas/60">
                    {SORTABLE.slice(0, 1).map((column) => (
                      <SortHeader
                        key={column.key}
                        label={column.label}
                        active={result.sort === column.key}
                        dir={result.dir}
                        href={sortHref(column.key)}
                      />
                    ))}
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                      Contact
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                      Source
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                      Verification
                    </th>
                    {SORTABLE.slice(1).map((column) => (
                      <SortHeader
                        key={column.key}
                        label={column.label}
                        active={result.sort === column.key}
                        dir={result.dir}
                        href={sortHref(column.key)}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-line/70 hover:bg-canvas/60">
                      <td className="px-4 py-3">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="text-[13px] font-semibold text-ink hover:text-brand hover:underline"
                        >
                          {lead.companyName}
                        </Link>
                        <p className="text-[11px] text-muted">
                          {lead.domain ?? lead.location ?? "No domain recorded"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[13px] text-ink-soft">{lead.contactName ?? "—"}</p>
                        <p className="text-[11px] text-muted">
                          {lead.contactEmail ?? lead.contactTitle ?? "No contact detail"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[12px] text-ink-soft">
                          {lead.source?.name ?? "No source"}
                        </p>
                        {lead.sourceUrl ? (
                          <a
                            href={lead.sourceUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                          >
                            Evidence
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-muted">No evidence URL</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={VERIFICATION_TONES[lead.verificationStatus] ?? "neutral"}>
                          {lead.verificationStatus === "VERIFIED"
                            ? "Verified"
                            : lead.verificationStatus === "PARTIAL"
                              ? "Partial"
                              : "Unverified"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-semibold text-ink">
                        {lead.score}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONES[lead.status] ?? "neutral"}>
                          {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-muted">
                        {formatDate(lead.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-muted">
                Showing {(result.page - 1) * result.pageSize + 1}–
                {Math.min(result.page * result.pageSize, result.total)} of {result.total}
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={href({ page: String(Math.max(1, result.page - 1)) })}
                  aria-disabled={result.page <= 1}
                  className={buttonClasses({
                    variant: "secondary",
                    size: "sm",
                    className: result.page <= 1 ? "pointer-events-none opacity-50" : "",
                  })}
                >
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  Previous
                </Link>
                <span className="text-[11px] font-semibold text-muted">
                  Page {result.page} of {result.pageCount}
                </span>
                <Link
                  href={href({ page: String(Math.min(result.pageCount, result.page + 1)) })}
                  aria-disabled={result.page >= result.pageCount}
                  className={buttonClasses({
                    variant: "secondary",
                    size: "sm",
                    className:
                      result.page >= result.pageCount ? "pointer-events-none opacity-50" : "",
                  })}
                >
                  Next
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-sm font-semibold text-ink">Verification legend</h2>
        <div className="mt-3 grid gap-3 text-[12px] leading-relaxed text-muted sm:grid-cols-3">
          <p>
            <Badge tone="success" className="mr-1.5">
              Verified
            </Badge>
            Key fields were checked against a permitted source recently.
          </p>
          <p>
            <Badge tone="warning" className="mr-1.5">
              Partial
            </Badge>
            Some fields have evidence; others are missing or stale.
          </p>
          <p>
            <Badge tone="neutral" className="mr-1.5">
              Unverified
            </Badge>
            Stored from a source but not independently confirmed.
          </p>
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
          Exports include verification status, source name, evidence URL, and retrieval date so
          recipients can judge data quality.
        </p>
      </Card>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  href,
}: {
  label: string;
  active: boolean;
  dir: string;
  href: string;
}) {
  return (
    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
      <Link
        href={href}
        className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`}
        aria-label={`Sort by ${label}${active && dir === "asc" ? " descending" : " ascending"}`}
      >
        {label}
        <ArrowUpDown className="size-3" aria-hidden="true" />
      </Link>
    </th>
  );
}
