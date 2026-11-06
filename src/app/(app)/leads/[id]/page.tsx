import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileText,
  Globe,
  Link2,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { DeleteLeadForm } from "@/components/leads/delete-lead-form";
import { LeadNotesForm } from "@/components/leads/lead-notes-form";
import { LeadStatusForm } from "@/components/leads/lead-status-form";
import { roleAtLeast, requireWorkspace } from "@/lib/auth/workspace";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import {
  getLeadDetail,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  VERIFICATION_LABELS,
} from "@/server/services/leads";

export const metadata = { title: "Lead detail" };

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

const ACTIVITY_LABELS: Record<string, string> = {
  IMPORTED: "Imported",
  STATUS_CHANGED: "Status changed",
  NOTE_UPDATED: "Notes updated",
  CREATED: "Created",
  RESEARCHED: "Researched",
  QUALIFIED: "Qualified",
  OUTREACH_DRAFTED: "Outreach drafted",
  OUTREACH_APPROVED: "Outreach approved",
  OUTREACH_SENT: "Outreach sent",
  UNSUBSCRIBED: "Unsubscribed",
};

function parseTags(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseDetail(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function DetailRow({
  label,
  value,
  href,
  icon,
}: {
  label: string;
  value: string | null | undefined;
  href?: string | null;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 py-2.5">
      {icon ? <span className="mt-0.5 text-muted">{icon}</span> : null}
      <div className="min-w-0">
        <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-[13px] text-ink-soft">
          {value ? (
            href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
              >
                {value}
                <ArrowUpRight className="size-3" aria-hidden="true" />
              </a>
            ) : (
              value
            )
          ) : (
            <span className="text-muted">Not recorded</span>
          )}
        </dd>
      </div>
    </div>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const { id } = await params;
  const lead = await getLeadDetail(context.workspace.id, id);
  if (!lead) notFound();

  const tags = parseTags(lead.tags);
  const canEdit = roleAtLeast(context.role, "MEMBER");
  const canDelete = roleAtLeast(context.role, "ADMIN");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/leads"
            className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to leads
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
              {lead.companyName}
            </h1>
            <Badge tone={STATUS_TONES[lead.status] ?? "neutral"}>
              {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
            </Badge>
            <Badge tone={VERIFICATION_TONES[lead.verificationStatus] ?? "neutral"}>
              {VERIFICATION_LABELS[lead.verificationStatus] ?? lead.verificationStatus}
            </Badge>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
            {lead.domain ? (
              <span className="inline-flex items-center gap-1">
                <Globe className="size-3.5" aria-hidden="true" />
                {lead.domain}
              </span>
            ) : null}
            {lead.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {lead.location}
              </span>
            ) : null}
            {lead.industry ? (
              <span className="inline-flex items-center gap-1">
                <Building2 className="size-3.5" aria-hidden="true" />
                {lead.industry}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              Added {formatDate(lead.createdAt)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lead.website ? (
            <a
              href={lead.website}
              target="_blank"
              rel="noreferrer noopener"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              <Globe className="size-4" aria-hidden="true" />
              Website
            </a>
          ) : null}
          {lead.sourceUrl ? (
            <a
              href={lead.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={buttonClasses({ size: "sm" })}
            >
              <Link2 className="size-4" aria-hidden="true" />
              View evidence
            </a>
          ) : null}
          {canDelete ? (
            <DeleteLeadForm leadId={lead.id} companyName={lead.companyName} />
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Company and contact"
              description="Blank fields are unknown. LeadPilot never infers missing contact details."
            />
            <dl className="grid gap-x-8 px-5 py-3 sm:grid-cols-2 [&>div]:border-b [&>div]:border-line/60 [&>div:last-child]:border-0 sm:[&>div:nth-last-child(2)]:border-0">
              <DetailRow
                label="Contact"
                value={lead.contactName}
                icon={<User className="size-3.5" />}
              />
              <DetailRow
                label="Title"
                value={lead.contactTitle}
                icon={<FileText className="size-3.5" />}
              />
              <DetailRow
                label="Email"
                value={lead.contactEmail}
                href={lead.contactEmail ? `mailto:${lead.contactEmail}` : null}
                icon={<Mail className="size-3.5" />}
              />
              <DetailRow
                label="Phone"
                value={lead.contactPhone}
                href={lead.contactPhone ? `tel:${lead.contactPhone}` : null}
                icon={<Phone className="size-3.5" />}
              />
              <DetailRow
                label="LinkedIn"
                value={lead.linkedinUrl}
                href={lead.linkedinUrl}
                icon={<Link2 className="size-3.5" />}
              />
              <DetailRow
                label="Employees"
                value={lead.employeeCount === null ? null : lead.employeeCount.toLocaleString()}
                icon={<Building2 className="size-3.5" />}
              />
              <DetailRow
                label="Revenue band"
                value={lead.revenueBand}
                icon={<FileText className="size-3.5" />}
              />
              <DetailRow
                label="Owner"
                value={lead.owner?.name}
                icon={<User className="size-3.5" />}
              />
            </dl>
            {lead.description ? (
              <div className="border-t border-line px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                  Description
                </p>
                <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">
                  {lead.description}
                </p>
              </div>
            ) : null}
            {tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-5 py-3">
                {tags.map((tag) => (
                  <Badge key={tag} tone="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Status and notes"
              description="Changes are written to the lead timeline and the workspace audit log."
            />
            <div className="space-y-5 px-5 py-4">
              {canEdit ? (
                <LeadStatusForm
                  leadId={lead.id}
                  currentStatus={lead.status}
                  options={LEAD_STATUSES.map((status) => ({
                    value: status,
                    label: LEAD_STATUS_LABELS[status] ?? status,
                  }))}
                />
              ) : (
                <p className="text-sm text-muted">
                  Your role can view this lead but not change its status.
                </p>
              )}
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-[11px] font-semibold text-ink">Team notes</p>
                {canEdit ? (
                  <LeadNotesForm leadId={lead.id} notes={lead.notes} />
                ) : (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
                    {lead.notes ?? "No notes recorded."}
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Verification records"
              description="Field-level evidence collected from permitted sources."
            />
            {lead.verifications.length === 0 ? (
              <div className="px-5 py-8">
                <p className="text-sm text-muted">
                  No field has been independently checked yet. The lead keeps its source record,
                  but treat the data as unverified until you confirm it.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-line bg-canvas/60">
                      {["Field", "Status", "Evidence", "Checked"].map((heading) => (
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
                    {lead.verifications.map((verification) => (
                      <tr key={verification.id} className="border-b border-line/60 last:border-0">
                        <td className="px-5 py-3 text-[12px] font-medium text-ink">
                          {verification.field}
                          {verification.note ? (
                            <span className="block text-[11px] font-normal text-muted">
                              {verification.note}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-5 py-3">
                          <Badge
                            tone={VERIFICATION_TONES[verification.status] ?? "neutral"}
                          >
                            {VERIFICATION_LABELS[verification.status] ?? verification.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-[12px]">
                          {verification.sourceUrl ? (
                            <a
                              href={verification.sourceUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                            >
                              Source
                              <ArrowUpRight className="size-3" aria-hidden="true" />
                            </a>
                          ) : (
                            <span className="text-muted">None</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-[11px] text-muted">
                          {formatDate(verification.checkedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Activity" description="Most recent changes first." />
            {lead.activities.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted">No activity recorded yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {lead.activities.map((activity) => {
                  const detail = parseDetail(activity.detail);
                  return (
                    <li key={activity.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-ink">
                          {ACTIVITY_LABELS[activity.type] ?? activity.type}
                          <span className="ml-2 font-normal text-muted">
                            {activity.actor?.name ?? "System"} ·{" "}
                            {formatRelativeTime(activity.createdAt)}
                          </span>
                        </p>
                        {Object.keys(detail).length > 0 ? (
                          <p className="mt-0.5 break-words text-[11px] text-muted">
                            {Object.entries(detail)
                              .map(([key, value]) => `${key}: ${String(value)}`)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Source"
              description="Where this record came from and what it permits."
            />
            <div className="px-5 py-4">
              {lead.source ? (
                <div className="space-y-3 text-[12px] leading-relaxed">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                      Provider
                    </p>
                    <p className="mt-0.5 font-semibold text-ink">{lead.source.name}</p>
                    <p className="text-muted">
                      {lead.source.provider} · {lead.source.type}
                    </p>
                  </div>
                  {lead.source.licenseNote ? (
                    <p className="rounded-lg bg-canvas px-3 py-2 text-[11px] text-ink-soft">
                      {lead.source.licenseNote}
                    </p>
                  ) : null}
                  {lead.source.termsUrl ? (
                    <a
                      href={lead.source.termsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                    >
                      Source terms
                      <ArrowUpRight className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                  {lead.sourceRecordId ? (
                    <p className="text-[11px] text-muted">
                      Record ID: <span className="text-ink-soft">{lead.sourceRecordId}</span>
                    </p>
                  ) : null}
                  {lead.retrievedAt ? (
                    <p className="text-[11px] text-muted">
                      Retrieved {formatDate(lead.retrievedAt)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  This lead has no source record. That should not happen for imported or
                  discovered leads — treat it as a data-quality issue.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Score" description="Fit score from qualification runs." />
            <div className="px-5 py-4">
              <p className="font-display text-3xl font-semibold text-ink">{lead.score}</p>
              <p className="mt-1 text-[11px] text-muted">out of 100</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Campaigns" description="Where this lead is being worked." />
            {lead.campaignLeads.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted">Not in any campaign yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {lead.campaignLeads.map((membership) => (
                  <li key={membership.id} className="px-5 py-3">
                    <Link
                      href={`/campaigns/${membership.campaign.id}`}
                      className="text-[13px] font-semibold text-ink hover:text-brand hover:underline"
                    >
                      {membership.campaign.name}
                    </Link>
                    <p className="text-[11px] text-muted">
                      {membership.campaign.status} · stage {membership.stage}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Outreach drafts" description="Nothing sends without approval." />
            {lead.outreachMessages.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted">No drafts for this lead.</p>
            ) : (
              <ul className="divide-y divide-line">
                {lead.outreachMessages.map((message) => (
                  <li key={message.id} className="px-5 py-3">
                    <p className="truncate text-[12px] font-medium text-ink">{message.subject}</p>
                    <p className="text-[11px] text-muted">
                      {message.status} · {formatDate(message.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Alert tone="shield" title="Approval required before sending">
            Outreach starts as a grounded draft. An admin must approve the exact subject and body,
            and sending also requires a configured email provider, a clean suppression check, and an
            active campaign.
          </Alert>
        </div>
      </div>
    </div>
  );
}
