import Link from "next/link";
import { ArrowLeft, ArrowRight, Database, ExternalLink, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/auth/workspace";
import { formatDate } from "@/lib/utils";
import {
  getLeadsPage,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
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

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const query = typeof params.q === "string" ? params.q : undefined;
  const page = parsePage(params.page);

  const result = await getLeadsPage(context.workspace.id, { status, query, page });
  const filtered = Boolean(status || query);

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
        <Link href="/integrations" className={buttonClasses({ size: "sm" })}>
          <Database className="size-4" aria-hidden="true" />
          Lead sources
        </Link>
      </div>

      <Card>
        <div className="border-b border-line p-3">
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((tab) => {
              const href = new URLSearchParams();
              if (tab.key) href.set("status", tab.key);
              if (query) href.set("q", query);
              const active = (status ?? undefined) === tab.key;
              return (
                <Link
                  key={tab.label}
                  href={`/leads${href.size > 0 ? `?${href.toString()}` : ""}`}
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
            <button type="submit" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Search
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
                ? "Try a different status or search term. Filters only apply to leads already stored in this workspace."
                : "Leads appear here after a permitted source is connected and an agent run stores attributed company records. LeadPilot does not seed example leads."}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {filtered ? (
                <Link href="/leads" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Clear filters
                </Link>
              ) : (
                <Link href="/integrations" className={buttonClasses({ size: "sm" })}>
                  Check source configuration
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              )}
              <Link href="/agents" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                View agents
              </Link>
            </div>
            <p className="mx-auto mt-6 max-w-md rounded-xl bg-canvas px-4 py-3 text-[11px] leading-relaxed text-muted">
              CSV import of data you already have the right to use will be enabled in a later
              phase. No import button is shown until it actually works.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-canvas/60">
                    {[
                      "Company",
                      "Contact",
                      "Source",
                      "Verification",
                      "Score",
                      "Status",
                      "Added",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-line/70 hover:bg-canvas/60">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-semibold text-ink">{lead.companyName}</p>
                        <p className="text-[11px] text-muted">
                          {lead.domain ?? lead.location ?? "No domain recorded"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[13px] text-ink-soft">
                          {lead.contactName ?? "—"}
                        </p>
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
                  href={`/leads?${new URLSearchParams({
                    ...(status ? { status } : {}),
                    ...(query ? { q: query } : {}),
                    page: String(Math.max(1, result.page - 1)),
                  }).toString()}`}
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
                  href={`/leads?${new URLSearchParams({
                    ...(status ? { status } : {}),
                    ...(query ? { q: query } : {}),
                    page: String(Math.min(result.pageCount, result.page + 1)),
                  }).toString()}`}
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
      </Card>
    </div>
  );
}
