import Link from "next/link";
import { Ban, CheckCircle2, KeyRound, MailWarning, ShieldCheck, Users } from "lucide-react";

import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { PasswordForm } from "@/components/settings/password-form";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { db } from "@/lib/db";
import { requireWorkspace, roleAtLeast } from "@/lib/auth/workspace";
import { env } from "@/lib/env";
import { formatCurrency, formatDate, percentage } from "@/lib/utils";
import { countSuppressions } from "@/server/services/suppression";
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

export default async function SettingsPage() {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const [memberships, usage, suppressedCount] = await Promise.all([
    db.membership.findMany({
      where: { workspaceId: context.workspace.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    getUsageSummary(context.workspace.id),
    countSuppressions(context.workspace.id),
  ]);

  const profile = context.workspace.profile;
  const canEdit = roleAtLeast(context.role, "ADMIN");
  const plan = context.plan;
  const limits = context.limits;
  const seatLimit = limits.seats ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Settings</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          Manage your account, workspace profile, security, team, and plan usage.
        </p>
      </div>

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
              <Badge tone="outline">
                {memberships.length} / {seatLimit} seats
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
          <div className="border-t border-line px-5 py-3">
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
              <Users className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Team invitations are part of the collaboration phase. Seats are already counted
              so limits stay accurate when invitations are enabled.
            </p>
          </div>
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
                  ? memberships.length
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
                {env.billingConfigured
                  ? "Billing provider configured. Subscription changes are handled through Stripe."
                  : "Billing is not configured in this environment. Your workspace stays on the Free plan; no payment method is collected."}
              </p>
              <Link
                href="/pricing"
                className="mt-2 inline-flex font-semibold text-brand hover:text-brand-dark"
              >
                Compare plans
              </Link>
            </div>
          </div>
        </Card>
      </div>

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
    </div>
  );
}
