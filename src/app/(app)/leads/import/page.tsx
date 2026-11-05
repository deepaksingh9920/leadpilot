import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, History, ShieldCheck } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ImportWizard } from "@/components/leads/import-wizard";
import { roleAtLeast, requireWorkspace } from "@/lib/auth/workspace";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { getRecentImports } from "@/server/services/imports";
import { getUsageSummary, getWorkspaceLimits } from "@/server/services/workspaces";

export const metadata = { title: "Import leads" };

export default async function ImportLeadsPage() {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const [imports, usage, limits] = await Promise.all([
    getRecentImports(context.workspace.id, 8),
    getUsageSummary(context.workspace.id, ["leads_per_month"]),
    getWorkspaceLimits(context.workspace.id),
  ]);

  const leadLimit = limits.leads_per_month ?? 0;
  const used = usage.leads_per_month ?? 0;
  const remaining = Math.max(0, leadLimit - used);
  const allowed = roleAtLeast(context.role, "MEMBER");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/leads"
            className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to leads
          </Link>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Import leads</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Bring in companies you already have the right to contact. Map the columns, confirm
            your rights, and LeadPilot records every row with its source and evidence.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
            Leads this month
          </p>
          <p className="mt-1 font-display text-lg font-semibold text-ink">
            {used.toLocaleString()} / {leadLimit.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted">{remaining.toLocaleString()} remaining</p>
        </div>
      </div>

      <Alert tone="shield" title="Authorized data only">
        Never upload purchased lists you cannot evidence, scraped data, or personal data collected
        without a lawful basis. Imported rows stay unverified unless you provide an evidence URL or
        a later agent checks them.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <Card className="p-5">
          {allowed ? (
            <ImportWizard />
          ) : (
            <div className="py-10 text-center">
              <ShieldCheck className="mx-auto size-6 text-muted" aria-hidden="true" />
              <h2 className="mt-3 font-display text-base font-semibold text-ink">
                Your role cannot import leads
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
                Ask a workspace member or admin to import this file, or request a role change from
                your workspace owner.
              </p>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="How deduplication works"
              description="The same business is stored once per workspace."
            />
            <div className="space-y-3 px-5 py-4 text-[12px] leading-relaxed text-muted">
              <p>
                <span className="font-semibold text-ink">1. Email.</span> A contact email identifies
                the row, lowercased and trimmed.
              </p>
              <p>
                <span className="font-semibold text-ink">2. Domain.</span> Without an email,
                LeadPilot uses the company domain.
              </p>
              <p>
                <span className="font-semibold text-ink">3. Company + location.</span> When neither
                exists, a normalized company name and location are used.
              </p>
              <p className="rounded-lg bg-canvas px-3 py-2">
                Re-importing the same file adds zero new leads. Fixes to existing leads happen on
                the lead detail page, not by overwriting silently.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Column tips" action={<FileSpreadsheet className="size-4 text-muted" />} />
            <ul className="space-y-2 px-5 py-4 text-[12px] leading-relaxed text-muted">
              <li>Use one row per company and one contact per row.</li>
              <li>Evidence URL should point to the record you licensed or collected.</li>
              <li>Employee count accepts values like “250” or “250 employees”.</li>
              <li>Tags can be separated with commas, semicolons, or pipes.</li>
              <li>Leave unknown fields blank — blanks are not filled in later.</li>
            </ul>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Recent imports"
          description="Every import keeps a row-level report."
          action={<History className="size-4 text-muted" />}
        />
        {imports.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No imports yet. Your first import report will appear here.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {imports.map((record) => (
              <Link
                key={record.id}
                href={`/leads/imports/${record.id}`}
                className="flex flex-col gap-2 px-5 py-3.5 transition-colors hover:bg-canvas/60 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{record.filename}</p>
                  <p className="text-[11px] text-muted">
                    {record.createdBy.name} · {formatRelativeTime(record.createdAt)} ·{" "}
                    {formatDate(record.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="success">{record.importedCount} imported</Badge>
                  <Badge tone="warning">{record.duplicateCount} duplicates</Badge>
                  <Badge tone="danger">{record.invalidCount} invalid</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
        <div className="border-t border-line px-5 py-3">
          <Link href="/leads" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            View all leads
          </Link>
        </div>
      </Card>
    </div>
  );
}
