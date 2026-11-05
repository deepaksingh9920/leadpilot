import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, FileWarning } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth/workspace";
import { formatDate } from "@/lib/utils";
import { getImportReport } from "@/server/services/imports";

export const metadata = { title: "Import report" };

export default async function ImportReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await getImportReport(context.workspace.id, id);
  if (!result) notFound();

  const { record, report } = result;
  const created = query.created === "1";

  const summary = [
    { label: "Rows in file", value: record.rowCount, tone: "text-ink" },
    { label: "Imported", value: record.importedCount, tone: "text-success" },
    { label: "Duplicates skipped", value: record.duplicateCount, tone: "text-warning" },
    { label: "Invalid rows", value: record.invalidCount, tone: "text-danger" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/leads/import"
          className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Import another file
        </Link>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
          Import report
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {record.filename} · {record.createdBy.name} · {formatDate(record.createdAt)} ·{" "}
          {record.source?.name ?? "CSV import"}
        </p>
      </div>

      {created ? (
        <Alert tone="success" title="Import complete">
          {record.importedCount > 0
            ? `${record.importedCount} new lead${record.importedCount === 1 ? "" : "s"} stored in this workspace.`
            : "No new leads were stored — every valid row already existed or was duplicated."}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((item) => (
          <div key={item.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
              {item.label}
            </p>
            <p className={`mt-1 font-display text-2xl font-semibold ${item.tone}`}>
              {item.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/leads" className={buttonClasses({ size: "sm" })}>
          View leads
        </Link>
        <Link href="/leads/import" className={buttonClasses({ variant: "secondary", size: "sm" })}>
          Import another CSV
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Invalid rows"
            description="These rows were rejected and not saved."
            action={<FileWarning className="size-4 text-danger" />}
          />
          {report.issues.length === 0 ? (
            <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted">
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              Every row passed validation.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {report.issues.map((issue) => (
                <li key={issue.line} className="px-5 py-3">
                  <p className="text-[12px] font-semibold text-ink">Line {issue.line}</p>
                  <ul className="mt-1 space-y-0.5">
                    {issue.errors.map((error) => (
                      <li key={error} className="flex items-start gap-1.5 text-[12px] text-danger">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        {error}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {report.truncatedIssues > 0 ? (
            <p className="border-t border-line px-5 py-3 text-[11px] text-muted">
              {report.truncatedIssues} more invalid row
              {report.truncatedIssues === 1 ? "" : "s"} not shown.
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Duplicate rows"
            description="Skipped because the same lead already existed in this file or workspace."
            action={<Copy className="size-4 text-warning" />}
          />
          {report.duplicateLines.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">No duplicates were found.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 px-5 py-4">
              {report.duplicateLines.map((line) => (
                <span
                  key={line}
                  className="rounded-md border border-line bg-canvas px-2 py-1 text-[11px] font-medium text-ink-soft"
                >
                  Line {line}
                </span>
              ))}
            </div>
          )}
          {report.truncatedDuplicates > 0 ? (
            <p className="border-t border-line px-5 py-3 text-[11px] text-muted">
              {report.truncatedDuplicates} more duplicate row
              {report.truncatedDuplicates === 1 ? "" : "s"} not shown.
            </p>
          ) : null}
        </Card>
      </div>

      <Alert tone="info" title="Why rows are rejected, not repaired">
        LeadPilot never invents a company name, email, phone number, or evidence URL. Rows with
        invalid required fields are reported here so you can fix the source file and import it
        again.
      </Alert>
    </div>
  );
}
