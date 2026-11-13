import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Gauge,
  Lock,
  Settings2,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { AgentRunForm } from "@/components/agents/agent-run-form";
import { parseAgentInputSchema } from "@/lib/agents/input-schema";
import { roleAtLeast, requireWorkspace } from "@/lib/auth/workspace";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { getAgentStatus } from "@/server/services/providers";
import { toggleAgentAction } from "@/server/actions/agents";
import { db } from "@/lib/db";
import { getUsageSummary, getWorkspaceLimits } from "@/server/services/workspaces";

export const metadata = { title: "Agent detail" };

const JOB_TONES: Record<string, "brand" | "success" | "warning" | "danger" | "neutral"> = {
  QUEUED: "warning",
  RUNNING: "brand",
  SUCCEEDED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

const STAGE_LABELS: Record<string, string> = {
  discover: "Discover",
  research: "Research",
  qualify: "Qualify",
  draft: "Draft",
  follow_up: "Follow-up",
};

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const { slug } = await params;
  const agent = await db.agentDefinition.findFirst({
    where: { OR: [{ slug }, { key: slug }], isActive: true },
  });
  if (!agent) notFound();

  const [allowed, config, jobs, limits, usage] = await Promise.all([
    context.plan
      ? db.planAgent.findFirst({ where: { planId: context.plan.id, agentKey: agent.key } })
      : Promise.resolve(null),
    db.agentConfig.findUnique({
      where: {
        workspaceId_agentKey: { workspaceId: context.workspace.id, agentKey: agent.key },
      },
    }),
    db.job.findMany({
      where: { workspaceId: context.workspace.id, agentKey: agent.key },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    getWorkspaceLimits(context.workspace.id),
    getUsageSummary(context.workspace.id, ["agent_runs_per_month"]),
  ]);

  const schema = parseAgentInputSchema(agent.inputSchema);
  const runtime = await getAgentStatus(agent.key, context.workspace.id);
  const enabled = Boolean(config?.enabled);
  const canManage = roleAtLeast(context.role, "ADMIN");
  const canRun = roleAtLeast(context.role, "MEMBER");
  const runLimit = limits.agent_runs_per_month ?? 0;
  const runsUsed = usage.agent_runs_per_month ?? 0;
  const runsRemaining = Math.max(0, runLimit - runsUsed);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/agents"
          className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to agents
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{agent.name}</h1>
          <Badge tone="outline">{STAGE_LABELS[agent.stage] ?? agent.stage}</Badge>
          {agent.requiresApproval ? (
            <Badge tone="warning">
              <Lock className="size-3" aria-hidden="true" />
              Approval required
            </Badge>
          ) : null}
          <Badge tone={enabled ? "success" : "neutral"}>
            {enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{agent.description}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <Card>
          <CardHeader
            title="Start a run"
            description="The run is queued as a background job and reserves one agent run from your monthly allowance."
          />
          <div className="space-y-4 px-5 py-4">
            {!allowed ? (
              <Alert tone="warning" title="Not in your plan">
                This agent is not included in the {context.plan?.name ?? "Free"} plan. Upgrade to
                queue runs.
              </Alert>
            ) : !enabled ? (
              <div className="space-y-3">
                <Alert tone="info" title="Enable this agent first">
                  Agents stay off until a workspace admin enables them. Enabling does not start a
                  run or send anything.
                </Alert>
                {canManage ? (
                  <form action={toggleAgentAction}>
                    <input type="hidden" name="agentKey" value={agent.key} />
                    <input type="hidden" name="enable" value="true" />
                    <button type="submit" className={buttonClasses({ size: "sm" })}>
                      Enable {agent.name}
                    </button>
                  </form>
                ) : (
                  <p className="text-[12px] text-muted">
                    Ask a workspace admin to enable this agent.
                  </p>
                )}
              </div>
            ) : !runtime.runnable ? (
              <Alert tone="warning" title="Execution is not available in this build">
                {runtime.message}
              </Alert>
            ) : !canRun ? (
              <Alert tone="info" title="View-only role">
                Your role can view this agent but not queue runs.
              </Alert>
            ) : schema.parseError ? (
              <Alert tone="danger" title="Input schema error">
                {schema.parseError}
              </Alert>
            ) : runsRemaining === 0 ? (
              <Alert tone="warning" title="Monthly run limit reached">
                You have used {runsUsed.toLocaleString()} of {runLimit.toLocaleString()} runs this
                month. Upgrade or wait for the next billing period.
              </Alert>
            ) : (
              <AgentRunForm agentKey={agent.key} properties={schema.properties} />
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Configuration" action={<Settings2 className="size-4 text-muted" />} />
            <dl className="divide-y divide-line px-5 text-[12px]">
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted">Plan access</dt>
                <dd className={allowed ? "font-semibold text-success" : "font-semibold text-muted"}>
                  {allowed ? "Included" : "Upgrade required"}
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted">Run cost</dt>
                <dd className="font-semibold text-ink">
                  {agent.creditCost} credit{agent.creditCost === 1 ? "" : "s"}
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted">Provider</dt>
                <dd className="font-semibold text-ink">
                  {runtime.provider === "ai"
                    ? "AI model"
                    : runtime.provider === "lead_source"
                      ? "Lead source"
                      : runtime.provider === "email"
                        ? "Email provider"
                        : "None"}
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted">Runtime</dt>
                <dd>
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
                        : runtime.code === "RUNTIME_NOT_READY"
                          ? "Runtime disabled"
                          : "Unavailable"}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted">Runs this month</dt>
                <dd className="font-semibold text-ink">
                  {runsUsed.toLocaleString()} / {runLimit.toLocaleString()}
                </dd>
              </div>
            </dl>
          </Card>

          <Alert tone="info" title="How queued runs behave">
            A queued job runs only when the background worker is active. It can be cancelled before
            execution; cancelling or a permanent failure refunds the reserved run.
          </Alert>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Recent runs"
          description="The ten most recent jobs for this agent in this workspace."
          action={
            <Link href="/agents" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              All agents
            </Link>
          }
        />
        {jobs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No runs yet. Queued jobs and their step logs will appear here.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/runs/${job.id}`}
                className="flex flex-col gap-2 px-5 py-3.5 transition-colors hover:bg-canvas/60 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    Run {job.id.slice(-8)}
                    <Badge tone={JOB_TONES[job.status] ?? "neutral"}>{job.status}</Badge>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {formatRelativeTime(job.createdAt)} · {formatDate(job.createdAt)} · attempt{" "}
                    {job.attempts}/{job.maxAttempts}
                  </p>
                  {job.error ? (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-danger">{job.error}</p>
                  ) : null}
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand">
                  Inspect
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <Gauge className="size-3.5" aria-hidden="true" />
        Runs are gated by your plan and the workspace runtime. Queueing never sends email or
        contacts a prospect; executors write only inside this workspace.
      </p>
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <CalendarClock className="size-3.5" aria-hidden="true" />
        Job leases last two minutes; transient failures retry with backoff up to three attempts.
      </p>
    </div>
  );
}
