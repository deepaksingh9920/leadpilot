import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Gauge,
  Mail,
  ShieldCheck,
  Target,
  Users,
  X,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { AddLeadsForm } from "@/components/campaigns/add-leads-form";
import {
  CampaignCapForm,
  CampaignStatusForm,
} from "@/components/campaigns/campaign-settings-forms";
import { requireWorkspace, roleAtLeast } from "@/lib/auth/workspace";
import { formatDate } from "@/lib/utils";
import { removeCampaignLeadAction } from "@/server/actions/campaigns";
import { getCampaignDetail, getQualifiedLeadOptions } from "@/server/services/leads";

export const metadata = { title: "Campaign detail" };

const STATUS_TONES: Record<string, "brand" | "success" | "warning" | "neutral"> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "brand",
};

const MESSAGE_TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "brand"> = {
  DRAFT: "neutral",
  APPROVED: "success",
  SCHEDULED: "warning",
  SENT: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const { id } = await params;
  const result = await getCampaignDetail(context.workspace.id, id);
  if (!result) notFound();

  const { campaign, funnel } = result;
  const qualifiedOptions = await getQualifiedLeadOptions(context.workspace.id);
  const memberIds = new Set(campaign.leads.map((row) => row.lead.id));
  const availableOptions = qualifiedOptions.filter((option) => !memberIds.has(option.id));

  const canEdit = roleAtLeast(context.role, "MEMBER");
  const canManage = roleAtLeast(context.role, "ADMIN");

  const stats = [
    { label: "Leads", value: funnel.added, icon: Users },
    { label: "Drafted", value: funnel.drafted, icon: Mail },
    { label: "Approved", value: funnel.approved, icon: CheckCircle2 },
    { label: "Sent", value: funnel.sent, icon: Target },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href="/campaigns"
            className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to campaigns
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
              {campaign.name}
            </h1>
            <Badge tone={STATUS_TONES[campaign.status] ?? "neutral"}>{campaign.status}</Badge>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            {campaign.goal ?? "No goal recorded for this campaign."}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Created by {campaign.createdBy.name} · {formatDate(campaign.createdAt)} · daily cap{" "}
            {campaign.dailySendCap}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/leads" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <Users className="size-4" aria-hidden="true" />
            Browse leads
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
              <stat.icon className="size-3.5" aria-hidden="true" />
              {stat.label}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {stat.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Leads in this campaign"
              description="Only qualified leads can be added. Removing a lead keeps the lead in your workspace."
            />
            {campaign.leads.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted">
                No leads yet. Add qualified leads from the panel on the right.
              </p>
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-line bg-canvas/60">
                      {["Company", "Contact", "Stage", "Added", ""].map((heading) => (
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
                    {campaign.leads.map((row) => (
                      <tr key={row.id} className="border-b border-line/60 last:border-0">
                        <td className="px-5 py-3">
                          <Link
                            href={`/leads/${row.lead.id}`}
                            className="text-[13px] font-semibold text-ink hover:text-brand hover:underline"
                          >
                            {row.lead.companyName}
                          </Link>
                          <p className="text-[11px] text-muted">
                            {row.lead.domain ?? "No domain"} · score {row.lead.score}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-[12px] text-ink-soft">
                          {row.lead.contactName ?? "—"}
                          <p className="text-[11px] text-muted">
                            {row.lead.contactEmail ?? "No email"}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone="outline">{row.stage}</Badge>
                        </td>
                        <td className="px-5 py-3 text-[11px] text-muted">
                          {formatDate(row.addedAt)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {canEdit ? (
                            <form action={removeCampaignLeadAction}>
                              <input type="hidden" name="campaignId" value={campaign.id} />
                              <input type="hidden" name="leadId" value={row.lead.id} />
                              <button
                                type="submit"
                                className="inline-flex size-7 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                                aria-label={`Remove ${row.lead.companyName} from campaign`}
                                title="Remove from campaign"
                              >
                                <X className="size-4" />
                              </button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Add qualified leads"
              description="Unqualified leads are excluded. Add at most 200 at a time."
            />
            <div className="px-5 py-4">
              {canEdit ? (
                <AddLeadsForm campaignId={campaign.id} options={availableOptions} />
              ) : (
                <p className="text-sm text-muted">Your role cannot edit this campaign.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Outreach messages"
              description="Drafts and approvals for this campaign."
              action={<Mail className="size-4 text-muted" />}
            />
            {campaign.messages.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted">
                No messages yet. Outreach drafting ships with the outreach phase; nothing is sent
                automatically.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {campaign.messages.map((message) => (
                  <li
                    key={message.id}
                    className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-ink">
                        {message.subject}
                      </p>
                      <p className="text-[11px] text-muted">{formatDate(message.createdAt)}</p>
                    </div>
                    <Badge tone={MESSAGE_TONES[message.status] ?? "neutral"}>
                      {message.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Campaign status" action={<Gauge className="size-4 text-muted" />} />
            <div className="px-5 py-4">
              <CampaignStatusForm
                campaignId={campaign.id}
                currentStatus={campaign.status}
                canManage={canManage}
              />
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                Activating requires at least one lead. Status changes are audited; activation does
                not send email in this build.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Daily send cap" />
            <div className="px-5 py-4">
              <CampaignCapForm
                campaignId={campaign.id}
                dailySendCap={campaign.dailySendCap}
                canManage={canManage}
              />
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                A hard ceiling between 1 and 500 messages per day. Campaigns also respect the
                workspace daily send limit on your plan.
              </p>
            </div>
          </Card>

          <Alert tone="shield" title="Human approval required">
            Any outreach this campaign produces is stored as a draft. A workspace admin must review
            and approve each message before it can be scheduled, and every send requires a
            configured email provider plus unsubscribe handling.
          </Alert>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
              <ShieldCheck className="size-4 text-success" aria-hidden="true" />
              Campaign safety
            </h2>
            <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted">
              <li>Suppressed addresses are excluded before drafting.</li>
              <li>Daily caps apply per campaign and per workspace.</li>
              <li>Removing a lead leaves the lead intact in your workspace.</li>
              <li>No send path is enabled until email delivery is configured.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
