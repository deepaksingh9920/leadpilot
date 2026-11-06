import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Mail,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import {
  ApproveOutreachForm,
  CancelOutreachForm,
  OutreachEditorForm,
  SendOutreachForm,
} from "@/components/campaigns/outreach-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { canApproveOutreach, requireWorkspace, roleAtLeast } from "@/lib/auth/workspace";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/utils";
import { getOutreachMessageDetail, OUTREACH_STATUS_LABELS } from "@/server/services/outreach";

export const metadata = { title: "Outreach message" };

const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "brand"> = {
  DRAFT: "neutral",
  APPROVED: "success",
  SENDING: "warning",
  SCHEDULED: "warning",
  SENT: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export default async function OutreachMessagePage({
  params,
}: {
  params: Promise<{ id: string; messageId: string }>;
}) {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const { id: campaignId, messageId } = await params;
  const result = await getOutreachMessageDetail(context.workspace.id, messageId);
  if (!result) notFound();

  const { message, preview } = result;
  if (message.campaignId !== campaignId) notFound();
  if (!message.campaign) notFound();

  const canApprove = canApproveOutreach(context.role);
  const canEdit = roleAtLeast(context.role, "MEMBER");
  const editable = canEdit && ["DRAFT", "APPROVED"].includes(message.status);
  const canCancel = canEdit && !["SENT", "CANCELLED", "SENDING"].includes(message.status);
  const statusLabel = OUTREACH_STATUS_LABELS[message.status] ?? message.status;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link
            href={`/campaigns/${campaignId}`}
            className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to {message.campaign.name}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
              {message.subject}
            </h1>
            <Badge tone={STATUS_TONES[message.status] ?? "neutral"}>{statusLabel}</Badge>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            To{" "}
            <Link
              href={`/leads/${message.lead.id}`}
              className="font-medium text-brand hover:underline"
            >
              {message.lead.companyName}
            </Link>
            {message.lead.contactName ? ` · ${message.lead.contactName}` : ""} ·{" "}
            {message.lead.contactEmail ?? "No email stored"}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Drafted by {message.createdBy.name} · {formatDate(message.createdAt)}
            {message.approvedBy ? ` · Approved by ${message.approvedBy.name}` : ""}
            {message.sentAt ? ` · Sent ${formatDate(message.sentAt)}` : ""}
          </p>
        </div>
      </div>

      {message.failureReason ? (
        <Alert tone="warning" title="Last send attempt">
          {message.failureReason}
        </Alert>
      ) : null}

      {message.status === "SENT" ? (
        <Alert tone="success" title="Delivered to the email provider">
          The approval, exact content hash, provider message ID, and unsubscribe token are recorded.
          Unsubscribes are processed without a login through the signed link in the footer.
        </Alert>
      ) : null}

      {!env.emailConfigured ? (
        <Alert tone="info" title="Email delivery is not configured">
          Approvals and drafts work now. Sending requires RESEND_API_KEY and EMAIL_FROM. The message
          stays approved until delivery is configured.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Message content"
              description="Only stored workspace and lead facts are used. Editing an approved message revokes approval."
            />
            <div className="px-5 py-4">
              <OutreachEditorForm
                messageId={message.id}
                campaignId={campaignId}
                subject={message.subject}
                body={message.body}
                readOnly={!editable}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Exact email preview"
              description="This is the full message, including the sender identity and unsubscribe footer that are added at send time."
            />
            <div className="px-5 py-4">
              {preview ? (
                <div className="rounded-xl border border-line bg-canvas/50 p-4">
                  <p className="border-b border-line pb-3 text-[12px] text-ink-soft">
                    <span className="font-semibold text-ink">Subject:</span> {preview.subject}
                  </p>
                  <pre className="mt-3 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-ink-soft">
                    {preview.text}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Add a valid contact email and a complete workspace profile to preview the exact
                  delivery content.
                </p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Approval and delivery"
              action={<ShieldCheck className="size-4 text-success" aria-hidden="true" />}
            />
            <div className="space-y-4 px-5 py-4">
              <dl className="space-y-2 text-[12px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Status</dt>
                  <dd>
                    <Badge tone={STATUS_TONES[message.status] ?? "neutral"}>{statusLabel}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Approved</dt>
                  <dd className="font-medium text-ink">
                    {message.approvedAt ? formatDate(message.approvedAt) : "Not yet"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Content hash</dt>
                  <dd className="max-w-[160px] truncate font-mono text-[10px] text-muted">
                    {message.approvedContentHash ?? "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Provider ID</dt>
                  <dd className="max-w-[160px] truncate font-mono text-[10px] text-muted">
                    {message.providerMessageId ?? "—"}
                  </dd>
                </div>
              </dl>

              {message.status === "DRAFT" ? (
                <div className="space-y-2">
                  <ApproveOutreachForm
                    messageId={message.id}
                    campaignId={campaignId}
                    canApprove={canApprove}
                  />
                  <p className="text-[11px] leading-relaxed text-muted">
                    Approval covers this exact subject and body. Editing later returns the message
                    to draft.
                  </p>
                </div>
              ) : null}

              {message.status === "APPROVED" ? (
                <div className="space-y-2">
                  <SendOutreachForm
                    messageId={message.id}
                    campaignId={campaignId}
                    canApprove={canApprove}
                  />
                  <p className="text-[11px] leading-relaxed text-muted">
                    The sender re-checks suppression, the approval hash, the campaign cap, and your
                    plan&apos;s daily send allowance before calling the provider.
                  </p>
                </div>
              ) : null}

              {message.status === "SENDING" ? (
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-warning">
                  <Clock3 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  This message is claimed for delivery. Refresh after the request completes.
                </p>
              ) : null}

              {canCancel ? (
                <CancelOutreachForm messageId={message.id} campaignId={campaignId} />
              ) : null}

              {!canApprove ? (
                <p className="text-[11px] leading-relaxed text-muted">
                  Only workspace admins and owners can approve or send outreach.
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              Compliance checks
            </h2>
            <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted">
              <li>Recipient is re-checked against the suppression list at send time.</li>
              <li>Approval is invalidated if the subject or body changes.</li>
              <li>A signed unsubscribe link and mailing address are appended.</li>
              <li>Campaign and workspace daily caps are enforced before delivery.</li>
            </ul>
          </Card>

          {message.status === "SENT" ? (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                <Mail className="size-4 text-muted" aria-hidden="true" />
                Unsubscribe
              </h2>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                The signed link in the footer adds the recipient to this workspace&apos;s
                suppression list. The token is bound to this message and recipient.
              </p>
            </Card>
          ) : null}

          {message.status === "CANCELLED" ? (
            <Alert tone="info" title="Cancelled">
              <span className="inline-flex items-start gap-1.5">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Nothing was sent. You can create a new draft for this lead from the campaign.
              </span>
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}
