import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarClock,
  Check,
  Gauge,
  Lock,
  Mail,
  Radar,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireWorkspace, roleAtLeast } from "@/lib/auth/workspace";
import { getAgentStatus } from "@/server/services/providers";
import { toggleAgentAction } from "@/server/actions/agents";

export const metadata = { title: "Agents" };

const ICONS: Record<string, LucideIcon> = {
  search: Search,
  "building-2": Building2,
  gauge: Gauge,
  mail: Mail,
  "calendar-clock": CalendarClock,
  radar: Radar,
};

const STAGE_LABELS: Record<string, string> = {
  discover: "Discover",
  research: "Research",
  qualify: "Qualify",
  draft: "Draft",
  follow_up: "Follow-up",
};

export default async function AgentsPage() {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const [agents, planAgents, configs] = await Promise.all([
    db.agentDefinition.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    context.plan
      ? db.planAgent.findMany({
          where: { planId: context.plan.id },
          select: { agentKey: true },
        })
      : Promise.resolve([]),
    db.agentConfig.findMany({ where: { workspaceId: context.workspace.id } }),
  ]);

  const allowed = new Set(planAgents.map((item) => item.agentKey));
  const configMap = new Map(configs.map((config) => [config.agentKey, config]));
  const canManage = roleAtLeast(context.role, "ADMIN");
  const enabledCount = agents.filter(
    (agent) => allowed.has(agent.key) && configMap.get(agent.key)?.enabled,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Agents</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Enable the specialists you want available in this workspace. Enabling an agent
            does not run it or send anything — execution requires the agent runtime.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="brand">
            {enabledCount} of {agents.length} enabled
          </Badge>
          <Badge tone="outline">{context.plan?.name ?? "Free"} plan</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => {
          const Icon = ICONS[agent.icon] ?? Search;
          const included = allowed.has(agent.key);
          const config = configMap.get(agent.key);
          const enabled = included && Boolean(config?.enabled);
          const runtime = getAgentStatus(agent.key);

          return (
            <Card key={agent.key} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-dark ring-1 ring-brand/10">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <Badge tone="outline">{STAGE_LABELS[agent.stage] ?? agent.stage}</Badge>
                  {agent.requiresApproval ? (
                    <Badge tone="warning">
                      <Lock className="size-3" aria-hidden="true" />
                      Approval
                    </Badge>
                  ) : null}
                </div>
              </div>

              <h2 className="mt-4 font-display text-base font-semibold text-ink">
                {agent.name}
              </h2>
              <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted">
                {agent.description}
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-[11px]">
                <div>
                  <dt className="text-muted">Run cost</dt>
                  <dd className="font-semibold text-ink">
                    {agent.creditCost} credit{agent.creditCost === 1 ? "" : "s"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Plan access</dt>
                  <dd className={included ? "font-semibold text-success" : "font-semibold text-muted"}>
                    {included ? "Included" : "Upgrade required"}
                  </dd>
                </div>
              </dl>

              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-muted">Runtime</span>
                <Badge
                  tone={
                    runtime.runnable
                      ? "success"
                      : runtime.code === "PROVIDER_MISSING"
                        ? "warning"
                        : "outline"
                  }
                >
                  {runtime.runnable
                    ? "Ready"
                    : runtime.code === "PROVIDER_MISSING"
                      ? "Provider missing"
                      : "Runtime pending"}
                </Badge>
              </div>

              <div className="mt-4">
                {!included ? (
                  <div className="rounded-xl bg-canvas px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                    Not part of the {context.plan?.name ?? "Free"} plan. Upgrade to enable this
                    specialist.
                  </div>
                ) : canManage ? (
                  <form action={toggleAgentAction}>
                    <input type="hidden" name="agentKey" value={agent.key} />
                    <input type="hidden" name="enable" value={enabled ? "false" : "true"} />
                    <button
                      type="submit"
                      className={`inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[12px] font-semibold transition-colors ${
                        enabled
                          ? "border border-line-strong bg-surface text-ink hover:bg-canvas"
                          : "bg-brand text-white hover:bg-brand-dark"
                      }`}
                    >
                      {enabled ? (
                        <>
                          <Check className="size-3.5" aria-hidden="true" />
                          Enabled — turn off
                        </>
                      ) : (
                        "Enable agent"
                      )}
                    </button>
                  </form>
                ) : (
                  <div className="rounded-xl bg-canvas px-3 py-2.5 text-[11px] text-muted">
                    {enabled ? "Enabled" : "Disabled"} · an admin can change this setting.
                  </div>
                )}
              </div>

              <Link
                href={`/agents/${agent.slug}`}
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
              >
                View details and runs
              </Link>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="How execution works"
          description="The configuration is live; the runtime is a later phase."
          action={<SlidersHorizontal className="size-4 text-muted" aria-hidden="true" />}
        />
        <div className="grid gap-4 p-5 md:grid-cols-3">
          {[
            {
              title: "Context first",
              body: "Runs use your business profile, target criteria, and stored lead evidence. Missing data is reported as missing.",
            },
            {
              title: "Credits and limits",
              body: "Each run reserves credits against your monthly allowance before it starts. Failed runs are handled explicitly.",
            },
            {
              title: "Approval gate",
              body: "Outreach and follow-up agents can only create drafts. Approval and sending are separate, logged steps.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl bg-canvas/60 p-4">
              <h3 className="text-[13px] font-semibold text-ink">{item.title}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
