import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Circle,
  Mail,
  Plug,
  Send,
  Sparkles,
  Users,
} from "lucide-react";

import { LeadsChart } from "@/components/app/leads-chart";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireWorkspace } from "@/lib/auth/workspace";
import { formatRelativeTime, percentage } from "@/lib/utils";
import { getDashboardData } from "@/server/services/dashboard";

export const metadata = { title: "Overview" };

const USAGE_ROWS = [
  { metric: "leads_per_month", label: "Leads this month", href: "/leads" },
  { metric: "agent_runs_per_month", label: "Agent runs", href: "/agents" },
  { metric: "sends_per_day", label: "Sends today", href: "/campaigns" },
  { metric: "exports_per_month", label: "Exports", href: "/leads" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireWorkspace();
  const params = await searchParams;
  const welcome = params.welcome === "1";
  const { workspace, user, limits, plan } = context;
  if (!workspace) return null;

  const data = await getDashboardData(workspace.id);
  const firstName = user.name.split(" ")[0];

  const checklist = [
    {
      label: "Complete your business profile",
      done: Boolean(workspace.profile?.valueProposition && workspace.profile?.industry),
      href: "/settings",
    },
    {
      label: "Verify your email address",
      done: Boolean(user.emailVerifiedAt),
      href: "/settings",
    },
    {
      label: "Connect a permitted lead source",
      done: data.environment.leadSourceConfigured,
      href: "/integrations",
    },
    {
      label: "Configure an AI provider",
      done: data.environment.aiConfigured,
      href: "/integrations",
    },
    {
      label: "Connect email delivery",
      done: data.environment.emailConfigured,
      href: "/integrations",
    },
  ];
  const remaining = checklist.filter((item) => !item.done).length;

  return (
    <div className="space-y-6">
      {welcome ? (
        <Alert tone="success" title="Workspace ready">
          Your profile is saved. The dashboard is unlocked — agents will only run when you
          start them, and outreach still requires approval.
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
              Welcome back, {firstName}
            </h1>
            <Badge tone="brand">{plan?.name ?? "Free"} plan</Badge>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            {workspace.name} · {workspace.profile?.industry ?? "Industry not set"} ·{" "}
            {workspace.profile?.regions ?? "No regions set"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/leads" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            View leads
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/agents" className={buttonClasses({ size: "sm" })}>
            <Bot className="size-4" aria-hidden="true" />
            Manage agents
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total leads",
            value: data.stats.leadTotal,
            hint: `${data.stats.leadsThisMonth} added this month`,
            icon: Users,
          },
          {
            label: "Verified leads",
            value: data.stats.verifiedLeads,
            hint: "Field evidence confirmed",
            icon: CheckCircle2,
          },
          {
            label: "Awaiting review",
            value: data.stats.draftCount,
            hint: "Drafts and approved messages",
            icon: Mail,
          },
          {
            label: "Active campaigns",
            value: data.stats.activeCampaigns,
            hint: `${data.stats.campaignCount} total campaigns`,
            icon: Send,
          },
        ].map((stat) => (
          <Card key={stat.label} className="p-5">
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                {stat.label}
              </p>
              <stat.icon className="size-4 text-brand/70" aria-hidden="true" />
            </div>
            <p className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
              {stat.value.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-muted">{stat.hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader
            title="Lead volume"
            description="Real sourced leads added over the last 30 days."
            action={
              <Badge tone={data.stats.leadsThisMonth > 0 ? "brand" : "outline"}>
                Last 30 days
              </Badge>
            }
          />
          <div className="p-5">
            <LeadsChart data={data.leadSeries} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Plan usage"
            description="Limits are enforced before an action runs."
            action={
              <Link
                href="/settings#plan"
                className="text-xs font-semibold text-brand hover:text-brand-dark"
              >
                Details
              </Link>
            }
          />
          <div className="space-y-5 p-5">
            {USAGE_ROWS.map((row) => {
              const used = data.usage[row.metric] ?? 0;
              const limit = limits[row.metric] ?? 0;
              return (
                <div key={row.metric}>
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      href={row.href}
                      className="text-[13px] font-medium text-ink-soft hover:text-ink"
                    >
                      {row.label}
                    </Link>
                    <span className="text-[11px] font-semibold text-muted">
                      {used.toLocaleString()} / {limit.toLocaleString()}
                    </span>
                  </div>
                  <Progress used={used} limit={limit} className="mt-2" />
                  <p className="mt-1 text-[10px] text-muted">
                    {percentage(used, limit)}% of plan allowance
                  </p>
                </div>
              );
            })}
            <div className="rounded-xl bg-canvas px-3.5 py-3 text-[11px] leading-relaxed text-muted">
              Need more capacity? Plan changes are handled in the billing phase. Current
              environment:{" "}
              <span className="font-semibold text-ink-soft">
                {data.environment.billingConfigured ? "billing configured" : "billing not configured"}
              </span>
              .
            </div>
          </div>
        </Card>
      </div>

      {remaining > 0 ? (
        <Card>
          <CardHeader
            title="Finish setting up"
            description={`${remaining} step${remaining === 1 ? "" : "s"} left before agents can run end to end.`}
          />
          <ul className="divide-y divide-line">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-3 px-5 py-3">
                {item.done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="size-4 shrink-0 text-line-strong" aria-hidden="true" />
                )}
                <span
                  className={
                    item.done
                      ? "flex-1 text-[13px] text-muted line-through"
                      : "flex-1 text-[13px] font-medium text-ink"
                  }
                >
                  {item.label}
                </span>
                {!item.done ? (
                  <Link
                    href={item.href}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-dark"
                  >
                    Set up
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </Link>
                ) : (
                  <Badge tone="success">Done</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader
            title="Agent pipeline"
            description="Plan availability and workspace enablement."
            action={
              <Link
                href="/agents"
                className="text-xs font-semibold text-brand hover:text-brand-dark"
              >
                Configure
              </Link>
            }
          />
          <ul className="divide-y divide-line">
            {data.agents.map((agent) => (
              <li key={agent.key} className="flex items-center gap-3 px-5 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
                  <Bot className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">{agent.name}</p>
                  <p className="truncate text-[11px] text-muted">{agent.category}</p>
                </div>
                {!agent.included ? (
                  <Badge tone="outline">Not in plan</Badge>
                ) : agent.enabled ? (
                  <Badge tone="success">Enabled</Badge>
                ) : (
                  <Badge tone="neutral">Off</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            description="Audit-logged actions in this workspace."
          />
          {data.activity.length === 0 ? (
            <div className="p-5">
              <div className="rounded-xl border border-dashed border-line bg-canvas/50 px-4 py-8 text-center">
                <Sparkles className="mx-auto size-5 text-line-strong" aria-hidden="true" />
                <p className="mt-2 text-[13px] font-semibold text-ink-soft">
                  No activity recorded yet
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Logins, approvals, sends, and settings changes will appear here.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.activity.map((entry) => (
                <li key={entry.id} className="px-5 py-3">
                  <p className="text-[13px] font-medium text-ink">{entry.action}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {entry.actor} · {formatRelativeTime(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="border-warning/20 bg-warning-soft/40">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm font-semibold text-ink">
              Honest status: what is live right now
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Workspace, authentication, onboarding, plan limits, and audit logging are
              operational. Agent execution, live lead-source connections, email delivery, and
              billing activate only when their provider credentials are configured. This
              workspace has {data.stats.leadTotal} leads and {data.stats.campaignCount}{" "}
              campaigns recorded.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
              <span className="rounded-full bg-surface px-2.5 py-1 text-muted ring-1 ring-line">
                AI: {data.environment.aiConfigured ? "configured" : "not configured"}
              </span>
              <span className="rounded-full bg-surface px-2.5 py-1 text-muted ring-1 ring-line">
                Lead source:{" "}
                {data.environment.leadSourceConfigured ? "configured" : "not configured"}
              </span>
              <span className="rounded-full bg-surface px-2.5 py-1 text-muted ring-1 ring-line">
                Email: {data.environment.emailConfigured ? "configured" : "not configured"}
              </span>
            </div>
          </div>
          <Link
            href="/integrations"
            className={buttonClasses({ variant: "secondary", size: "sm", className: "shrink-0" })}
          >
            <Plug className="size-4" aria-hidden="true" />
            Integrations
          </Link>
        </div>
      </Card>
    </div>
  );
}
