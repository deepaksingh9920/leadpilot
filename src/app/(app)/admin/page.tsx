import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  CreditCard,
  Flag,
  History,
  Layers,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireWorkspace } from "@/lib/auth/workspace";
import { FEATURE_FLAGS, getFeatureFlags } from "@/lib/features";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/utils";
import {
  PROVIDER_MANAGED_STATUSES,
  getAdminWorkspacesPage,
  getAuditWorkspaceOptions,
  searchAuditLogs,
} from "@/server/services/admin";
import { auditActionLabel, getAdminOverview } from "@/server/services/dashboard";
import {
  assignWorkspacePlanAction,
  updateFeatureFlagsAction,
  updatePlanAction,
} from "@/server/actions/admin";

export const metadata = { title: "Platform admin" };

const LIMIT_FIELDS = [
  { key: "leads_per_month", label: "Leads / month" },
  { key: "agent_runs_per_month", label: "Agent runs / month" },
  { key: "seats", label: "Seats" },
  { key: "workspaces", label: "Workspaces" },
  { key: "sends_per_day", label: "Sends / day" },
  { key: "exports_per_month", label: "Exports / month" },
];

const ERROR_MESSAGES: Record<string, string> = {
  "provider-price":
    "The plan could not be saved. Check prices (non-negative), limits (whole numbers), and Razorpay plan IDs (valid characters; each ID can belong to only one plan and interval).",
  "invalid":
    "The plan could not be saved. Check the name, description, and prices, then try again.",
  limits: "Limits must be whole numbers of zero or more.",
  missing: "That plan no longer exists. Refresh the page and try again.",
  workspace: "The workspace plan could not be assigned. Refresh and try again.",
  "provider-managed":
    "This workspace is billed through Razorpay. Cancel the provider subscription before assigning a plan manually, or the next webhook will overwrite the change.",
  flags: "Feature settings could not be saved. Refresh the page and try again.",
};

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parsePage(value: string | string[] | undefined): number {
  const raw = first(value);
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseDate(value: string | string[] | undefined, endOfDay: boolean): Date | null {
  const raw = first(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateInputValue(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

function hrefWith(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/admin?${query}` : "/admin";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireWorkspace({ allowIncomplete: true });
  if (!context.user.isSuperAdmin) redirect("/dashboard");

  const params = await searchParams;
  const saved = first(params.saved);
  const error = first(params.error);

  const workspaceQuery = first(params.wq) ?? "";
  const workspacePage = parsePage(params.wpage);
  const auditQuery = first(params.aq) ?? "";
  const auditWorkspace = first(params.aw) ?? "";
  const auditAction = first(params.aa) ?? "";
  const auditFrom = parseDate(params.afrom, false);
  const auditTo = parseDate(params.ato, true);
  const auditPage = parsePage(params.apage);

  const [overview, flags, workspacePageData, auditPageData, auditWorkspaces] =
    await Promise.all([
      getAdminOverview(),
      getFeatureFlags(),
      getAdminWorkspacesPage({ q: workspaceQuery, page: workspacePage }),
      searchAuditLogs({
        q: auditQuery,
        workspaceId: auditWorkspace || undefined,
        action: auditAction || undefined,
        from: auditFrom,
        to: auditTo,
        page: auditPage,
      }),
      getAuditWorkspaceOptions(),
    ]);

  const auditFilterParams = {
    aq: auditQuery || undefined,
    aw: auditWorkspace || undefined,
    aa: auditAction || undefined,
    afrom: first(params.afrom),
    ato: first(params.ato),
  };
  const workspaceHref = (page: number) =>
    hrefWith({ wq: workspaceQuery || undefined, wpage: String(page) });
  const auditHref = (page: number) =>
    hrefWith({ ...auditFilterParams, apage: String(page) });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
              Platform admin
            </h1>
            <Badge tone="brand">
              <ShieldCheck className="size-3" aria-hidden="true" />
              Superadmin
            </Badge>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Platform-wide configuration. Changes here affect every workspace and the public
            pricing page immediately.
          </p>
        </div>
      </div>

      {saved === "plan" || saved === "1" ? (
        <Alert tone="success">Plan configuration saved and audit-logged.</Alert>
      ) : null}
      {saved === "workspace" ? (
        <Alert tone="success">Workspace plan updated and audit-logged.</Alert>
      ) : null}
      {saved === "flags" ? (
        <Alert tone="success">Feature settings saved and audit-logged.</Alert>
      ) : null}
      {error ? <Alert tone="danger">{ERROR_MESSAGES[error] ?? ERROR_MESSAGES.invalid}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Workspaces", value: overview.workspaces, icon: Building2 },
          { label: "Users", value: overview.users, icon: Users },
          { label: "Plans", value: overview.plans.length, icon: CreditCard },
          { label: "Agent definitions", value: overview.agents.length, icon: Bot },
        ].map((stat) => (
          <Card key={stat.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                {stat.label}
              </p>
              <stat.icon className="size-4 text-brand/70" aria-hidden="true" />
            </div>
            <p className="mt-3 font-display text-3xl font-semibold text-ink">
              {stat.value.toLocaleString()}
            </p>
          </Card>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Layers className="size-4 text-brand" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-ink">Plans and limits</h2>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {overview.plans.map((plan) => {
            const limitMap = Object.fromEntries(plan.limits.map((limit) => [limit.metric, limit.limit]));
            const priceMap = Object.fromEntries(
              plan.providerPrices
                .filter((price) => price.provider === "razorpay")
                .map((price) => [price.interval, price.externalPlanId]),
            );
            return (
              <Card key={plan.id}>
                <CardHeader
                  title={plan.name}
                  description={`${plan.key} · ${plan._count.subscriptions} subscriber${
                    plan._count.subscriptions === 1 ? "" : "s"
                  }`}
                  action={
                    <Badge tone={plan.isActive ? "success" : "neutral"}>
                      {plan.isActive ? "Active" : "Inactive"}
                    </Badge>
                  }
                />
                <form action={updatePlanAction} className="space-y-4 p-5">
                  <input type="hidden" name="planId" value={plan.id} />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="label">Plan name</span>
                      <input
                        name="name"
                        defaultValue={plan.name}
                        className="input"
                        required
                        maxLength={60}
                      />
                    </label>
                    <label className="block">
                      <span className="label">Key</span>
                      <input value={plan.key} disabled className="input opacity-60" />
                    </label>
                  </div>

                  <label className="block">
                    <span className="label">Description</span>
                    <input
                      name="description"
                      defaultValue={plan.description}
                      className="input"
                      required
                      maxLength={200}
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="label">Monthly price (USD)</span>
                      <input
                        name="monthlyPrice"
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={(plan.monthlyPrice / 100).toFixed(2)}
                        className="input"
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="label">Yearly price (USD)</span>
                      <input
                        name="yearlyPrice"
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={(plan.yearlyPrice / 100).toFixed(2)}
                        className="input"
                        required
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {LIMIT_FIELDS.map((field) => (
                      <label key={field.key} className="block">
                        <span className="label">{field.label}</span>
                        <input
                          name={`limit_${field.key}`}
                          type="number"
                          min={0}
                          step={1}
                          defaultValue={limitMap[field.key] ?? 0}
                          className="input"
                          required
                        />
                      </label>
                    ))}
                  </div>

                  <div className="rounded-xl border border-line bg-canvas/60 p-3">
                    <p className="text-[11px] leading-relaxed text-muted">
                      Razorpay plan IDs are created in the Razorpay dashboard. Paste the
                      <code className="mx-1 rounded bg-white/60 px-1 py-0.5 text-[10px]">
                        plan_id
                      </code>
                      for each interval. Leave a field blank to disable that checkout option.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="label">Razorpay monthly plan ID</span>
                        <input
                          name="razorpayMonthlyPlanId"
                          defaultValue={priceMap.MONTHLY ?? ""}
                          className="input"
                          maxLength={120}
                          placeholder="plan_..."
                        />
                      </label>
                      <label className="block">
                        <span className="label">Razorpay yearly plan ID</span>
                        <input
                          name="razorpayYearlyPlanId"
                          defaultValue={priceMap.YEARLY ?? ""}
                          className="input"
                          maxLength={120}
                          placeholder="plan_..."
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <div className="flex flex-wrap gap-4 text-[12px] text-ink-soft">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="isActive"
                          defaultChecked={plan.isActive}
                          className="size-4 accent-brand"
                        />
                        Active
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="isPublic"
                          defaultChecked={plan.isPublic}
                          className="size-4 accent-brand"
                        />
                        Public
                      </label>
                    </div>
                    <SubmitButton size="sm" pendingLabel="Saving…">
                      Save plan
                    </SubmitButton>
                  </div>
                </form>
              </Card>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Workspaces"
          description="Every active workspace, its owner, and the plan it is entitled to."
          action={<Badge tone="outline">{workspacePageData.total} total</Badge>}
        />
        <div className="border-b border-line px-5 py-3">
          <form method="get" action="/admin" className="flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search workspaces</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                name="wq"
                defaultValue={workspaceQuery}
                placeholder="Search by workspace, slug, owner name, or email"
                className="input pl-9"
                maxLength={120}
              />
            </label>
            <SubmitButton size="sm" variant="secondary" pendingLabel="Searching…">
              Search
            </SubmitButton>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-[10px] uppercase tracking-[0.08em] text-muted">
                <th className="px-5 py-2.5 font-semibold">Workspace</th>
                <th className="px-4 py-2.5 font-semibold">Owner</th>
                <th className="px-4 py-2.5 font-semibold">Plan</th>
                <th className="px-4 py-2.5 text-right font-semibold">Members</th>
                <th className="px-4 py-2.5 text-right font-semibold">Leads</th>
                <th className="px-4 py-2.5 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {workspacePageData.workspaces.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[12px] text-muted">
                    No workspaces match this search.
                  </td>
                </tr>
              ) : (
                workspacePageData.workspaces.map((workspace) => {
                  const subscription = workspace.subscription;
                  const providerManaged = Boolean(
                    subscription?.providerSubscriptionId &&
                      PROVIDER_MANAGED_STATUSES.includes(
                        subscription.status as (typeof PROVIDER_MANAGED_STATUSES)[number],
                      ),
                  );
                  return (
                    <tr key={workspace.id}>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-ink">{workspace.name}</p>
                        <p className="text-[11px] text-muted">{workspace.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-ink-soft">{workspace.owner.name}</p>
                        <p className="text-[11px] text-muted">{workspace.owner.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {providerManaged ? (
                          <div className="space-y-1">
                            <Badge tone="brand">Razorpay</Badge>
                            <p className="text-[11px] text-muted">
                              {subscription?.plan.name} · {subscription?.status}
                            </p>
                          </div>
                        ) : (
                          <form action={assignWorkspacePlanAction} className="flex items-center gap-2">
                            <input type="hidden" name="workspaceId" value={workspace.id} />
                            <select
                              name="planId"
                              defaultValue={subscription?.planId ?? ""}
                              className="input h-8 max-w-[150px] py-1 text-[12px]"
                              aria-label={`Plan for ${workspace.name}`}
                              required
                            >
                              <option value="" disabled>
                                Choose a plan
                              </option>
                              {overview.plans
                                .filter((plan) => plan.isActive)
                                .map((plan) => (
                                  <option key={plan.id} value={plan.id}>
                                    {plan.name}
                                  </option>
                                ))}
                            </select>
                            <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">
                              Assign
                            </SubmitButton>
                          </form>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-soft">
                        {workspace._count.memberships}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-soft">
                        {workspace._count.leads}
                      </td>
                      <td className="px-4 py-3 text-muted">{formatDate(workspace.createdAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted">
            Showing{" "}
            {workspacePageData.total === 0
              ? 0
              : (workspacePageData.page - 1) * workspacePageData.pageSize + 1}
            –
            {Math.min(
              workspacePageData.page * workspacePageData.pageSize,
              workspacePageData.total,
            )}{" "}
            of {workspacePageData.total}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={workspaceHref(Math.max(1, workspacePageData.page - 1))}
              aria-disabled={workspacePageData.page <= 1}
              className={buttonClasses({
                variant: "secondary",
                size: "sm",
                className:
                  workspacePageData.page <= 1 ? "pointer-events-none opacity-50" : "",
              })}
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Previous
            </Link>
            <span className="text-[11px] font-semibold text-muted">
              Page {workspacePageData.page} of {workspacePageData.pageCount}
            </span>
            <Link
              href={workspaceHref(Math.min(workspacePageData.pageCount, workspacePageData.page + 1))}
              aria-disabled={workspacePageData.page >= workspacePageData.pageCount}
              className={buttonClasses({
                variant: "secondary",
                size: "sm",
                className:
                  workspacePageData.page >= workspacePageData.pageCount
                    ? "pointer-events-none opacity-50"
                    : "",
              })}
            >
              Next
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Feature flags"
            description="Platform-wide switches. Defaults are on; every change is audit-logged."
            action={<Flag className="size-4 text-muted" aria-hidden="true" />}
          />
          <form action={updateFeatureFlagsAction} className="space-y-4 p-5">
            {FEATURE_FLAGS.map((flag) => (
              <label key={flag.key} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name={`flag_${flag.key}`}
                  defaultChecked={flags[flag.key]}
                  className="mt-0.5 size-4 accent-brand"
                />
                <span>
                  <span className="block text-[12px] font-semibold text-ink">{flag.label}</span>
                  <span className="block text-[11px] leading-relaxed text-muted">
                    {flag.description}
                  </span>
                </span>
              </label>
            ))}
            <div className="border-t border-line pt-4">
              <SubmitButton size="sm" pendingLabel="Saving…">
                Save feature settings
              </SubmitButton>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader
            title="Agent catalog"
            description="Seeded definitions used across plans."
            action={<Badge tone="outline">{overview.agents.length} total</Badge>}
          />
          <ul className="divide-y divide-line">
            {overview.agents.map((agent) => (
              <li key={agent.key} className="flex items-center gap-3 px-5 py-3">
                <Bot className="size-4 shrink-0 text-brand" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">{agent.name}</p>
                  <p className="truncate text-[11px] text-muted">
                    {agent.key} · {agent.creditCost} credit
                    {agent.creditCost === 1 ? "" : "s"}
                  </p>
                </div>
                {agent.requiresApproval ? (
                  <Badge tone="warning">Approval</Badge>
                ) : (
                  <Badge tone="neutral">Auto</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Audit log"
          description="Search platform and workspace actions by keyword, workspace, action, or date."
          action={<History className="size-4 text-muted" aria-hidden="true" />}
        />
        <div className="border-b border-line px-5 py-3">
          <form method="get" action="/admin" className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <label className="relative xl:col-span-2">
              <span className="sr-only">Search audit entries</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                name="aq"
                defaultValue={auditQuery}
                placeholder="Action, entity, actor, metadata"
                className="input pl-9"
                maxLength={120}
              />
            </label>
            <label>
              <span className="sr-only">Workspace</span>
              <select name="aw" defaultValue={auditWorkspace} className="input">
                <option value="">All workspaces</option>
                {auditWorkspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Action prefix</span>
              <input
                name="aa"
                defaultValue={auditAction}
                placeholder="Action, e.g. outreach."
                className="input"
                maxLength={80}
              />
            </label>
            <label>
              <span className="sr-only">From date</span>
              <input
                type="date"
                name="afrom"
                defaultValue={dateInputValue(auditFrom)}
                className="input"
                aria-label="From date"
              />
            </label>
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="sr-only">To date</span>
                <input
                  type="date"
                  name="ato"
                  defaultValue={dateInputValue(auditTo)}
                  className="input"
                  aria-label="To date"
                />
              </label>
              <SubmitButton size="sm" variant="secondary" pendingLabel="Searching…">
                Search
              </SubmitButton>
            </div>
          </form>
        </div>
        {auditPageData.entries.length === 0 ? (
          <div className="px-5 py-10 text-center text-[12px] text-muted">
            No audit entries match these filters.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {auditPageData.entries.map((entry) => (
              <li key={entry.id} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] font-medium text-ink">
                    {auditActionLabel(entry.action)}
                  </p>
                  <Badge tone="outline">{entry.action}</Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  {entry.actor?.email ?? "System"}
                  {entry.workspace ? ` · ${entry.workspace.name}` : " · platform"}
                  {entry.entityId ? ` · ${entry.entityId}` : ""}
                  {" · "}
                  {formatRelativeTime(entry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-3 border-t border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted">
            Showing{" "}
            {auditPageData.total === 0 ? 0 : (auditPageData.page - 1) * auditPageData.pageSize + 1}
            –{Math.min(auditPageData.page * auditPageData.pageSize, auditPageData.total)} of{" "}
            {auditPageData.total}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={auditHref(Math.max(1, auditPageData.page - 1))}
              aria-disabled={auditPageData.page <= 1}
              className={buttonClasses({
                variant: "secondary",
                size: "sm",
                className: auditPageData.page <= 1 ? "pointer-events-none opacity-50" : "",
              })}
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Previous
            </Link>
            <span className="text-[11px] font-semibold text-muted">
              Page {auditPageData.page} of {auditPageData.pageCount}
            </span>
            <Link
              href={auditHref(Math.min(auditPageData.pageCount, auditPageData.page + 1))}
              aria-disabled={auditPageData.page >= auditPageData.pageCount}
              className={buttonClasses({
                variant: "secondary",
                size: "sm",
                className:
                  auditPageData.page >= auditPageData.pageCount
                    ? "pointer-events-none opacity-50"
                    : "",
              })}
            >
              Next
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold text-ink">Plan price snapshot</h2>
        </div>
        <div className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
          {overview.plans.map((plan) => (
            <div key={plan.id} className="rounded-xl bg-canvas/60 px-3.5 py-3">
              <p className="font-semibold text-ink">{plan.name}</p>
              <p className="text-muted">
                {plan.monthlyPrice === 0
                  ? "Free"
                  : `${formatCurrency(plan.monthlyPrice, plan.currency)}/mo`}
              </p>
              <p className="text-muted">
                {plan.yearlyPrice === 0
                  ? "No yearly price"
                  : `${formatCurrency(plan.yearlyPrice, plan.currency)}/yr`}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
