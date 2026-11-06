import Link from "next/link";
import { ArrowLeft, Ban, FileUp, ShieldCheck } from "lucide-react";

import {
  AddSuppressionForm,
  ImportSuppressionsForm,
  RemoveSuppressionForm,
} from "@/components/settings/suppression-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { requireWorkspace, roleAtLeast } from "@/lib/auth/workspace";
import { SUPPRESSION_REASON_LABELS } from "@/lib/outreach/suppression";
import { formatDate } from "@/lib/utils";
import {
  countSuppressions,
  listSuppressions,
} from "@/server/services/suppression";

export const metadata = { title: "Suppression list" };

export default async function SuppressionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const [entries, total] = await Promise.all([
    listSuppressions(context.workspace.id, { query: query || undefined, limit: 500 }),
    countSuppressions(context.workspace.id),
  ]);

  const canManage = roleAtLeast(context.role, "MEMBER");
  const canRemove = roleAtLeast(context.role, "ADMIN");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to settings
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            Suppression list
          </h1>
          <Badge tone="outline">{total.toLocaleString()} addresses</Badge>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          Suppressed addresses are excluded before a draft is created and checked again immediately
          before every send. Unsubscribes are added automatically through signed links.
        </p>
      </div>

      <Alert tone="shield" title="Suppression is enforced at draft and send time">
        Removing an entry allows future drafts to contact that address again. Only remove an entry
        when you have a lawful basis and a record of the request.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Add an address"
            description="Use this for a do-not-contact request received outside the platform."
            action={<Ban className="size-4 text-muted" aria-hidden="true" />}
          />
          <div className="px-5 py-4">
            {canManage ? (
              <AddSuppressionForm />
            ) : (
              <p className="text-sm text-muted">Your role cannot manage suppression.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Import a CSV"
            description="Bulk-add previously unsubscribed or bounced addresses."
            action={<FileUp className="size-4 text-muted" aria-hidden="true" />}
          />
          <div className="px-5 py-4">
            {canManage ? (
              <ImportSuppressionsForm />
            ) : (
              <p className="text-sm text-muted">Your role cannot manage suppression.</p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Suppressed addresses"
          description="Newest first. Search matches the normalized email address."
          action={<ShieldCheck className="size-4 text-success" aria-hidden="true" />}
        />
        <div className="border-b border-line px-5 py-3">
          <form action="/settings/suppression" className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search suppressed addresses"
              aria-label="Search suppressed addresses"
              className="input h-9 flex-1"
            />
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-xl border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink hover:bg-canvas"
            >
              Search
            </button>
            {query ? (
              <Link
                href="/settings/suppression"
                className="inline-flex h-9 items-center justify-center rounded-xl px-3 text-[13px] font-medium text-muted hover:text-ink"
              >
                Clear
              </Link>
            ) : null}
          </form>
        </div>

        {entries.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted">
            {query
              ? "No suppressed addresses match this search."
              : "No addresses are suppressed yet. Unsubscribes will appear here automatically."}
          </p>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-line bg-canvas/60">
                  {["Email", "Reason", "Source", "Added", ""].map((heading) => (
                    <th
                      key={heading}
                      className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3 text-[12px] font-medium text-ink">{entry.email}</td>
                    <td className="px-5 py-3">
                      <Badge tone={entry.reason === "UNSUBSCRIBED" ? "warning" : "neutral"}>
                        {SUPPRESSION_REASON_LABELS[
                          entry.reason as keyof typeof SUPPRESSION_REASON_LABELS
                        ] ?? entry.reason}
                      </Badge>
                    </td>
                    <td className="max-w-[200px] truncate px-5 py-3 text-[11px] text-muted">
                      {entry.source ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-[11px] text-muted">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canRemove ? <RemoveSuppressionForm entryId={entry.id} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
