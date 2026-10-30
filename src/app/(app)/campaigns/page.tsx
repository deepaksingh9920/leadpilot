import Link from "next/link";
import { CalendarClock, CheckCircle2, Send, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/auth/workspace";
import { formatDate } from "@/lib/utils";
import { getCampaignsForWorkspace } from "@/server/services/leads";

export const metadata = { title: "Campaigns" };

const STATUS_TONES: Record<string, "brand" | "success" | "warning" | "neutral"> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "brand",
};

export default async function CampaignsPage() {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const campaigns = await getCampaignsForWorkspace(context.workspace.id);
  const active = campaigns.filter((campaign) => campaign.status === "ACTIVE").length;
  const draft = campaigns.filter((campaign) => campaign.status === "DRAFT").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            Campaigns
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Group qualified leads into an outreach motion. Every message still needs a human
            approval before it can leave the workspace.
          </p>
        </div>
        <Link href="/agents" className={buttonClasses({ variant: "secondary", size: "sm" })}>
          <Send className="size-4" aria-hidden="true" />
          Outreach agents
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active campaigns", value: active, hint: "Currently sending approved mail" },
          { label: "Drafts", value: draft, hint: "Not yet activated" },
          { label: "Total campaigns", value: campaigns.length, hint: "All time in this workspace" },
        ].map((stat) => (
          <Card key={stat.label} className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              {stat.label}
            </p>
            <p className="mt-2 font-display text-3xl font-semibold text-ink">
              {stat.value.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-muted">{stat.hint}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="All campaigns"
          description="Approval thresholds and daily caps apply per campaign."
          action={
            <Badge tone="outline">
              Default cap{" "}
              {Number.parseInt(process.env.OUTREACH_DAILY_CAP_DEFAULT ?? "50", 10) || 50} sends /
              day
            </Badge>
          }
        />

        {campaigns.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <Send className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-lg font-semibold text-ink">
              No campaigns yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              Campaigns will appear here when the outreach phase is enabled and you create one
              from qualified leads. No example campaigns are created for you.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/leads" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                Browse leads
              </Link>
              <Link href="/agents" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                Review outreach agents
              </Link>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {campaigns.map((campaign) => (
              <li
                key={campaign.id}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">{campaign.name}</p>
                    <Badge tone={STATUS_TONES[campaign.status] ?? "neutral"}>
                      {campaign.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {campaign._count.leads} leads · {campaign._count.messages} messages ·{" "}
                    {campaign.createdBy.name} · {formatDate(campaign.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  Daily cap {campaign.dailySendCap}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
            <ShieldCheck className="size-4 text-success" aria-hidden="true" />
            Send safeguards
          </h2>
          <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted">
            <li>Suppression list checked before every send, including unsubscribes.</li>
            <li>Daily campaign cap and workspace send limit enforced server-side.</li>
            <li>Approval requires an admin or owner and records who approved what.</li>
            <li>Provider failures are reported on the message instead of being hidden.</li>
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
            <CheckCircle2 className="size-4 text-brand" aria-hidden="true" />
            Current status
          </h2>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            Campaign creation and message scheduling are part of the outreach phase. The
            approval gate and audit plumbing are already modelled, so nothing can be sent by
            accident while those features are inactive.
          </p>
          <Link
            href="/integrations"
            className="mt-3 inline-flex text-xs font-semibold text-brand hover:text-brand-dark"
          >
            Check email provider status
          </Link>
        </Card>
      </div>
    </div>
  );
}
