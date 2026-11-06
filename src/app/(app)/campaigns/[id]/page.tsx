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
import { CreateOutreachDraftForm } from "@/components/campaigns/outreach-forms";
import { requireWorkspace, roleAtLeast } from "@/lib/auth/workspace";
import { formatDate } from "@/lib/utils";
import { removeCampaignLeadAction } from "@/server/actions/campaigns";
import { getCampaignDetail, getQualifiedLeadOptions } from "@/server/services/leads";
import { getCampaignOutreachState } from "@/server/services/outreach";
import {
  getSuppressedEmails,
  normalizeSuppressionEmail,
} from "@/server/services/suppression";

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
  SENDING: "warning",
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
  const outreachRows = (await getCampaignOutreachState(context.workspace.id, campaign.id)) ?? [];
  const suppressed = await getSuppressedEmails(
    context.workspace.id,
    outreachRows
      .filter((row) => !row.message && row.contactEmail)
      .map((row) => row.contactEmail!),
  );
  const draftOptions = outreachRows
    .filter((row) => {
      if (row.message || !row.contactEmail) return false;
      const email = normalizeSuppressionEmail(row.contactEmail);
      return Boolean(email && !suppressed.has(email));
    })
    .map((row) => ({
      leadId: row.leadId,
      companyName: row.companyName,
      contactName: row.contactName,
      contactEmail: row.contactEmail,
    }));

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
              title="Outreach pipeline"
              description="Every campaign lead and the latest message prepared for it. Nothing is sent automatically."
              action={<Mail className="size-4 text-muted" />}
            />
            {outreachRows.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted">
                Add qualified leads to the campaign before preparing outreach.
              </p>
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[620px] text-left">
                  <thead>
                    <tr className="border-b border-line bg-canvas/60">
                      {["Company", "Contact", "Stage", "Message", ""].map((heading) => (
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
                    {outreachRows.map((row) => (
                      <tr key={row.leadId} className="border-b border-line/60 last:border-0">
                        <td className="px-5 py-3">
                          <Link
                            href={`/leads/${row.leadId}`}
                            className="text-[13px] font-semibold text-ink hover:text-brand hover:underline"
                          >
                            {row.companyName}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-[12px] text-ink-soft">
                          {row.contactName ?? "—"}
                          <p className="text-[11px] text-muted">
                            {row.contactEmail ?? "No email"}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone="outline">{row.stage}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          {row.message ? (
                            <div>
                              <Badge tone={MESSAGE_TONES[row.message.status] ?? "neutral"}>
                                {row.message.status}
                              </Badge>
                              {row.message.failureReason ? (
                                <p className="mt-1 max-w-[220px] text-[10px] leading-relaxed text-danger">
                                  {row.message.failureReason}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted">Not drafted</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {row.message ? (
                            <Link
                              href={`/campaigns/${campaign.id}/messages/${row.message.id}`}
                              className="text-[12px] font-semibold text-brand hover:text-brand-dark"
                            >
                              Open
                            </Link>
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
              title="Draft outreach"
              description="Generate a grounded draft from stored facts. An admin must approve the exact content before sending."
            />
            <div className="px-5 py-4">
              {canEdit ? (
                <CreateOutreachDraftForm campaignId={campaign.id} options={draftOptions} />
              ) : (
                <p className="text-sm text-muted">Your role cannot draft outreach.</p>
              )}
            </div>
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
                Activating requires at least one lead. Status changes are audited. Activation never
                bypasses per-message approval.
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
            Every message is stored as a draft. A workspace admin must approve the exact content
            before it can be sent, and the sender re-checks that approval and the suppression list
            immediately before delivery.
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
              <li>Each email carries a signed unsubscribe link and your mailing address.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
