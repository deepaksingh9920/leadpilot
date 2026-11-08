import { redirect } from "next/navigation";
import {
  Activity,
  Bot,
  Building2,
  CreditCard,
  Layers,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireWorkspace } from "@/lib/auth/workspace";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import { auditActionLabel, getAdminOverview } from "@/server/services/dashboard";
import { updatePlanAction } from "@/server/actions/admin";

export const metadata = { title: "Platform admin" };

const LIMIT_FIELDS = [
  { key: "leads_per_month", label: "Leads / month" },
  { key: "agent_runs_per_month", label: "Agent runs / month" },
  { key: "seats", label: "Seats" },
  { key: "workspaces", label: "Workspaces" },
  { key: "sends_per_day", label: "Sends / day" },
  { key: "exports_per_month", label: "Exports / month" },
];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireWorkspace({ allowIncomplete: true });
  if (!context.user.isSuperAdmin) redirect("/dashboard");

  const params = await searchParams;
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : undefined;
  const overview = await getAdminOverview();

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

      {saved ? <Alert tone="success">Plan configuration saved and audit-logged.</Alert> : null}
      {error ? (
        <Alert tone="danger">
          The plan could not be saved. Check prices (non-negative), limits (whole numbers), and
          Razorpay plan IDs (valid characters; each ID can belong to only one plan and interval).
        </Alert>
      ) : null}

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

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
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

        <Card>
          <CardHeader
            title="Recent platform audit"
            description="Latest actions across all workspaces."
            action={<Activity className="size-4 text-muted" aria-hidden="true" />}
          />
          {overview.recentAudit.length === 0 ? (
            <div className="px-5 py-10 text-center text-[12px] text-muted">
              No audit entries yet.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {overview.recentAudit.map((entry) => (
                <li key={entry.id} className="px-5 py-3">
                  <p className="text-[13px] font-medium text-ink">
                    {auditActionLabel(entry.action)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {entry.actor?.email ?? "System"}
                    {entry.workspace ? ` · ${entry.workspace.name}` : " · platform"}
                    {" · "}
                    {formatRelativeTime(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-display text-sm font-semibold text-ink">Plan price snapshot</h2>
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
