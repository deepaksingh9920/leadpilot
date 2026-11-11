import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  Download,
  KeyRound,
  MailWarning,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { PasswordForm } from "@/components/settings/password-form";
import { PendingInvites } from "@/components/settings/pending-invites";
import { TeamInviteForm } from "@/components/settings/team-invite-form";
import { OwnershipTransferForm } from "@/components/settings/ownership-transfer-form";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import {
  ComplianceSettingsForm,
  DeleteWorkspaceForm,
  RetentionCleanupForm,
} from "@/components/settings/compliance-forms";
import {
  BillingCheckoutOptions,
  CancelSubscriptionForm,
  type CheckoutPlan,
} from "@/components/settings/billing-forms";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getAccountDeletionState } from "@/server/services/account";
import { canManageBilling, requireWorkspace, roleAtLeast } from "@/lib/auth/workspace";
import { env } from "@/lib/env";
import { formatCurrency, formatDate, percentage } from "@/lib/utils";
import {
  BILLING_INTERVAL_LABELS,
  BILLING_STATUS_LABELS,
  getBillingState,
} from "@/server/services/billing";
import { getComplianceState } from "@/server/services/compliance";
import { countSuppressions } from "@/server/services/suppression";
import { getTeamState } from "@/server/services/team";
import { getUsageSummary, METRIC_LABELS } from "@/server/services/workspaces";

export const metadata = { title: "Settings" };

const ROLE_TONES: Record<string, "brand" | "success" | "warning" | "neutral"> = {
  OWNER: "brand",
  ADMIN: "success",
  MEMBER: "neutral",
  VIEWER: "warning",
};

const PLAN_METRICS = [
  "leads_per_month",
  "agent_runs_per_month",
  "sends_per_day",
  "exports_per_month",
  "seats",
  "workspaces",
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const params = await searchParams;
  // Only show the transfer notice to the former owner, who is now an admin. A
  // random visitor to ?ownership=transferred should not be told they changed roles.
  const ownershipTransferred =
    params.ownership === "transferred" && context.role === "ADMIN";

  const [team, usage, suppressedCount, billing, compliance, accountDeletion] =
    await Promise.all([
      getTeamState(context.workspace.id),
      getUsageSummary(context.workspace.id),
      countSuppressions(context.workspace.id),
      getBillingState(context.workspace.id),
      getComplianceState(context.workspace.id),
      getAccountDeletionState(context.user.id),
    ]);
  const { memberships, invites, seatLimit, seatsUsed } = team;

  const profile = context.workspace.profile;
  const canEdit = roleAtLeast(context.role, "ADMIN");
  const canManage = roleAtLeast(context.role, "ADMIN");
  const canInviteAdmin = roleAtLeast(context.role, "OWNER");
  const plan = context.plan;
  const limits = context.limits;
  const seatsLeft = Math.max(0, seatLimit - seatsUsed);
  const subscription = billing.subscription;
  const canBill = canManageBilling(context.role);
  const canDeleteWorkspace = roleAtLeast(context.role, "OWNER");
  const canTransferOwnership = roleAtLeast(context.role, "OWNER");
  const accountDeletionBlockedReason = context.user.isSuperAdmin
    ? "Superadmin accounts must be removed by another platform administrator."
    : accountDeletion.ownedActiveWorkspaces > 0
      ? accountDeletion.ownedActiveWorkspaces === 1
        ? "You own an active workspace. Transfer its ownership or delete it before closing your account."
        : `You own ${accountDeletion.ownedActiveWorkspaces} active workspaces. Transfer ownership or delete each one before closing your account.`
      : undefined;
  const ownershipCandidates = memberships
    .filter(
      (membership) =>
        membership.userId !== context.user.id &&
        membership.role !== "VIEWER" &&
        membership.role !== "OWNER",
    )
    .map((membership) => ({
      id: membership.userId,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
    }));
  const canCancelNow = Boolean(
    billing.configured &&
      subscription?.providerSubscriptionId &&
      !subscription.cancelAtPeriodEnd &&
      subscription.status !== "CANCELED",
  );
  const canStartCheckout = Boolean(
    billing.configured &&
      canBill &&
      (!subscription?.providerSubscriptionId || subscription.status === "CANCELED"),
  );
  const checkoutPlans: CheckoutPlan[] = billing.plans
    .filter((candidate) => candidate.monthlyPrice > 0 || candidate.yearlyPrice > 0)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      monthlyPrice: candidate.monthlyPrice,
      yearlyPrice: candidate.yearlyPrice,
      currency: candidate.currency,
      intervals: candidate.intervals,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Settings</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          Manage your account, workspace profile, security, team, and plan usage.
        </p>
      </div>

      {ownershipTransferred ? (
        <Alert tone="success">
          Ownership transferred. You are now an admin of this workspace. The new owner can
          manage billing, the team, compliance settings, and deletion.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <Avatar name={context.user.name} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-display text-base font-semibold text-ink">
                {context.user.name}
              </p>
              <p className="truncate text-[12px] text-muted">{context.user.email}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge tone={ROLE_TONES[context.role ?? "MEMBER"] ?? "neutral"}>
                  {context.role ?? "MEMBER"}
                </Badge>
                {context.user.isSuperAdmin ? <Badge tone="brand">Superadmin</Badge> : null}
              </div>
            </div>
          </div>

          <dl className="mt-5 space-y-3 border-t border-line pt-4 text-[12px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Workspace</dt>
              <dd className="truncate font-medium text-ink">{context.workspace.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Workspace created</dt>
              <dd className="font-medium text-ink">
                {formatDate(context.workspace.createdAt)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Email status</dt>
              <dd>
                {context.user.emailVerifiedAt ? (
                  <span className="inline-flex items-center gap-1 font-medium text-success">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-warning">
                    <MailWarning className="size-3.5" aria-hidden="true" />
                    Unverified
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {!context.user.emailVerifiedAt ? (
            <Alert tone="warning" className="mt-4">
              {env.emailConfigured
                ? "Use the banner at the top of the workspace to resend the verification email."
                : "Email delivery is not configured in this environment, so verification cannot be sent yet."}
            </Alert>
          ) : null}

          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            Email address changes are not enabled in this build. Contact the workspace owner
            if the account email is wrong.
          </p>
        </Card>

        <Card>
          <CardHeader
            title="Account security"
            description="Passwords are hashed with bcrypt. Sessions are stored hashed server-side."
            action={<KeyRound className="size-4 text-muted" aria-hidden="true" />}
          />
          <div className="p-5">
            <PasswordForm />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Business profile"
          description="Ground truth for research, qualification, and outreach drafts."
          action={canEdit ? <Badge tone="success">Editable</Badge> : <Badge tone="neutral">Read only</Badge>}
        />
        <div className="p-5">
          {canEdit ? (
            <ProfileSettingsForm
              defaults={{
                name: context.user.name,
                workspaceName: context.workspace.name,
                companyName: profile?.companyName ?? context.workspace.name,
                website: profile?.website ?? "",
                industry: profile?.industry ?? "",
                companySize: profile?.companySize ?? "",
                regions: profile?.regions ?? "",
                targetCustomerTypes: profile?.targetCustomerTypes ?? "",
                budgetMin: profile?.budgetMin?.toString() ?? "",
                budgetMax: profile?.budgetMax?.toString() ?? "",
                description: profile?.description ?? "",
                valueProposition: profile?.valueProposition ?? "",
                phone: profile?.phone ?? "",
                mailingAddress: profile?.mailingAddress ?? "",
                senderName: profile?.senderName ?? "",
                senderEmail: profile?.senderEmail ?? "",
              }}
            />
          ) : (
            <Alert tone="info">
              Only workspace admins and owners can edit the business profile. Ask an admin if
              something needs to change.
            </Alert>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Team"
            description="Members of this workspace and their role."
            action={
              <Badge tone={seatsLeft === 0 ? "warning" : "outline"}>
                {seatsUsed} / {seatLimit} seats
              </Badge>
            }
          />
          <ul className="divide-y divide-line">
            {memberships.map((membership) => (
              <li key={membership.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={membership.user.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {membership.user.name}
                    {membership.userId === context.user.id ? (
                      <span className="ml-1.5 text-[11px] font-normal text-muted">(you)</span>
                    ) : null}
                  </p>
                  <p className="truncate text-[11px] text-muted">{membership.user.email}</p>
                </div>
                <Badge tone={ROLE_TONES[membership.role] ?? "neutral"}>
                  {membership.role}
                </Badge>
              </li>
            ))}
          </ul>
          <PendingInvites
            invites={invites.map((invite) => ({
              id: invite.id,
              email: invite.email,
              role: invite.role,
              expiresAt: formatDate(invite.expiresAt),
              invitedByName: invite.invitedBy?.name ?? null,
            }))}
          />
          {canManage ? (
            <div className="border-t border-line px-5 py-4">
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                <Users className="size-3.5" aria-hidden="true" />
                Invite a teammate
              </p>
              <TeamInviteForm canInviteAdmin={canInviteAdmin} seatsLeft={seatsLeft} />
            </div>
          ) : (
            <div className="border-t border-line px-5 py-3">
              <p className="text-[11px] leading-relaxed text-muted">
                Only workspace admins and owners can invite teammates.
              </p>
            </div>
          )}
        </Card>

        <Card id="plan">
          <CardHeader
            title="Plan and usage"
            description="Current plan, limits, and this period's consumption."
            action={<Badge tone="brand">{plan?.name ?? "Free"}</Badge>}
          />
          <div className="space-y-4 p-5">
            {plan ? (
              <div className="flex items-baseline justify-between rounded-xl bg-canvas px-3.5 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-ink">{plan.name}</p>
                  <p className="text-[11px] text-muted">{plan.description}</p>
                </div>
                <p className="font-display text-lg font-semibold text-ink">
                  {plan.monthlyPrice === 0
                    ? "Free"
                    : `${formatCurrency(plan.monthlyPrice, plan.currency)}/mo`}
                </p>
              </div>
            ) : null}

            {PLAN_METRICS.filter((metric) => limits[metric] !== undefined).map((metric) => {
              const used =
                metric === "seats"
                  ? seatsUsed
                  : metric === "workspaces"
                    ? context.memberships.length
                    : (usage[metric] ?? 0);
              const limit = limits[metric];
              return (
                <div key={metric}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[12px] font-medium text-ink-soft">
                      {METRIC_LABELS[metric] ?? metric}
                    </p>
                    <span className="text-[11px] font-semibold text-muted">
                      {used.toLocaleString()} / {limit.toLocaleString()}
                    </span>
                  </div>
                  <Progress used={used} limit={limit} className="mt-1.5" />
                  <p className="mt-1 text-[10px] text-muted">
                    {percentage(used, limit)}% used
                  </p>
                </div>
              );
            })}

            <div className="rounded-xl border border-line bg-canvas/60 px-3.5 py-3 text-[11px] leading-relaxed text-muted">
              <p className="flex items-center gap-1.5 font-semibold text-ink-soft">
                <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
                Billing status
              </p>
              <p className="mt-1">
                {!billing.configured
                  ? `Billing is not configured in this environment, so payments cannot be collected here. Your workspace is on the ${plan?.name ?? "Free"} plan; no payment method is stored.`
                  : subscription?.providerSubscriptionId
                    ? `Payments are processed by Razorpay. ${
                        BILLING_STATUS_LABELS[subscription.status] ?? subscription.status
                      }${
                        subscription.interval
                          ? ` · ${
                              BILLING_INTERVAL_LABELS[subscription.interval] ??
                              subscription.interval
                            } billing`
                          : ""
                      }${
                        subscription.currentPeriodEnd
                          ? ` · ${
                              subscription.cancelAtPeriodEnd ||
                              subscription.status === "CANCELED"
                                ? "Ends"
                                : "Renews"
                            } ${formatDate(subscription.currentPeriodEnd)}`
                          : ""
                      }.`
                    : "Razorpay billing is configured. No paid subscription is attached to this workspace yet."}
              </p>
              <Link
                href="/pricing"
                className="mt-2 inline-flex font-semibold text-brand hover:text-brand-dark"
              >
                Compare plans
              </Link>
            </div>

            {billing.configured && subscription?.providerSubscriptionId ? (
              <dl className="space-y-2 border-t border-line pt-3 text-[12px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Provider</dt>
                  <dd className="font-medium text-ink">Razorpay</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Status</dt>
                  <dd className="font-medium text-ink">
                    {BILLING_STATUS_LABELS[subscription.status] ?? subscription.status}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Interval</dt>
                  <dd className="font-medium text-ink">
                    {subscription.interval
                      ? (BILLING_INTERVAL_LABELS[subscription.interval] ?? subscription.interval)
                      : "Not recorded"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">
                    {subscription.cancelAtPeriodEnd ? "Ends" : "Current period ends"}
                  </dt>
                  <dd className="font-medium text-ink">
                    {subscription.currentPeriodEnd
                      ? formatDate(subscription.currentPeriodEnd)
                      : "Not recorded"}
                  </dd>
                </div>
              </dl>
            ) : null}

            {canCancelNow ? (
              canBill ? (
                <CancelSubscriptionForm cancelsAtPeriodEnd={false} />
              ) : (
                <p className="text-[11px] leading-relaxed text-muted">
                  Only the workspace owner can change or cancel the subscription.
                </p>
              )
            ) : null}

            {billing.configured && subscription?.providerSubscriptionId &&
            subscription.cancelAtPeriodEnd ? (
              <CancelSubscriptionForm cancelsAtPeriodEnd />
            ) : null}

            {canStartCheckout ? (
              <div className="space-y-3 border-t border-line pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {subscription?.status === "CANCELED" ? "Start a new subscription" : "Upgrade"}
                </p>
                {!billing.webhooksConfigured ? (
                  <Alert tone="warning">
                    Add RAZORPAY_WEBHOOK_SECRET on the server before checkout. Without a verified
                    webhook a paid subscription could never be activated.
                  </Alert>
                ) : null}
                <BillingCheckoutOptions
                  plans={checkoutPlans}
                  disabled={!billing.webhooksConfigured}
                />
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card id="delete-account">
        <CardHeader
          title="Delete account"
          description="Close your personal account without deleting workspace records."
          action={<Badge tone="danger">Irreversible</Badge>}
        />
        <div className="p-5">
          <DeleteAccountForm
            email={context.user.email}
            blockedReason={accountDeletionBlockedReason}
          />
        </div>
      </Card>

      {canTransferOwnership ? (
        <Card id="ownership">
          <CardHeader
            title="Workspace ownership"
            description="Hand control of this workspace to another member. Only the current owner can do this."
            action={<Badge tone="brand">Owner only</Badge>}
          />
          <div className="p-5">
            <OwnershipTransferForm
              candidates={ownershipCandidates}
              canTransfer={canTransferOwnership}
            />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Suppression list"
          description="Addresses that must never receive outreach from this workspace."
          action={<Badge tone="warning">{suppressedCount.toLocaleString()} suppressed</Badge>}
        />
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
            <Ban className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
            Unsubscribes are added automatically. Manual entries and CSV imports are supported.
          </p>
          <Link
            href="/settings/suppression"
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink hover:bg-canvas"
          >
            Manage suppression
          </Link>
        </div>
      </Card>

      <Card id="compliance">
        <CardHeader
          title="Data and compliance"
          description="Retention, approval policy, exports, and workspace deletion."
          action={<ShieldCheck className="size-4 text-success" aria-hidden="true" />}
        />
        {compliance ? (
          <div className="grid gap-5 p-5 lg:grid-cols-2">
            <div className="space-y-5">
              <ComplianceSettingsForm
                canEdit={canManage}
                defaults={{
                  retentionDays: compliance.leadRetentionDays,
                  approvalPolicy: compliance.approvalPolicy,
                }}
              />

              <div className="rounded-xl border border-line bg-canvas/60 px-3.5 py-3 text-[11px] leading-relaxed text-muted">
                <p className="font-semibold text-ink-soft">Current data</p>
                <p className="mt-1">
                  {compliance.activeLeads.toLocaleString()} active lead(s),{" "}
                  {compliance.softDeletedLeads.toLocaleString()} soft-deleted lead(s) awaiting the{" "}
                  {compliance.graceDays}-day purge.{" "}
                  {compliance.oldestLeadAt
                    ? `Oldest active lead: ${formatDate(compliance.oldestLeadAt)}.`
                    : "No leads are stored yet."}
                </p>
                <div className="mt-3">
                  <p className="font-semibold text-ink-soft">Retention cleanup</p>
                  <p className="mb-2 mt-1">
                    Applies the retention window now. Soft-deleted data is purged permanently
                    after the grace period. The worker runs the same cleanup on every scheduled
                    run.
                  </p>
                  <RetentionCleanupForm canRun={canManage} />
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-xl border border-line px-3.5 py-3 text-[11px] leading-relaxed text-muted">
                <p className="flex items-center gap-1.5 font-semibold text-ink-soft">
                  <Download className="size-3.5" aria-hidden="true" />
                  Data export (DSAR)
                </p>
                <p className="mt-1">
                  Download a JSON bundle of the workspace, members, leads, campaigns, outreach,
                  suppression entries, imports, jobs, integrations, and audit log. The export is
                  audit-logged and rate-limited.
                </p>
                {canManage ? (
                  <a
                    href="/api/workspace/export"
                    className="mt-2 inline-flex h-9 items-center justify-center rounded-xl border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink hover:bg-canvas"
                  >
                    Download workspace data
                  </a>
                ) : (
                  <p className="mt-2 font-medium text-warning">
                    Only workspace admins and owners can export workspace data.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3 text-[11px] leading-relaxed text-muted">
                <p className="flex items-center gap-1.5 font-semibold text-danger">
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Delete workspace
                </p>
                <p className="mt-1">
                  Access ends immediately for every member. Data is purged after 30 days. A live
                  Razorpay subscription must be cancelled first; deletion is refused while billing
                  is active.
                </p>
                <div className="mt-3">
                  <DeleteWorkspaceForm
                    workspaceName={context.workspace.name}
                    canDelete={canDeleteWorkspace}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5">
            <Alert tone="warning">Compliance settings could not be loaded.</Alert>
          </div>
        )}
      </Card>
    </div>
  );
}
