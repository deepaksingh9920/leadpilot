import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, Clock, Play, ShieldAlert } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireWorkspace } from "@/lib/auth/workspace";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { cancelRunAction } from "@/server/actions/agents";
import { getJobDetail } from "@/server/services/jobs";

export const metadata = { title: "Run detail" };

const JOB_TONES: Record<string, "brand" | "success" | "warning" | "danger" | "neutral"> = {
  QUEUED: "warning",
  RUNNING: "brand",
  SUCCEEDED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

const STEP_TONES: Record<string, "brand" | "success" | "warning" | "danger" | "neutral"> = {
  PENDING: "neutral",
  RUNNING: "brand",
  SUCCEEDED: "success",
  FAILED: "danger",
  SKIPPED: "neutral",
};

function pretty(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const { id } = await params;
  const job = await getJobDetail(context.workspace.id, id);
  if (!job) notFound();

  const cancellable = job.status === "QUEUED" || job.status === "RUNNING";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={`/agents/${job.agent.slug}`}
            className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to {job.agent.name}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
              Run {job.id.slice(-8)}
            </h1>
            <Badge tone={JOB_TONES[job.status] ?? "neutral"}>{job.status}</Badge>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {job.agent.name} · queued by {job.createdBy.name} · {formatDate(job.createdAt)} (
            {formatRelativeTime(job.createdAt)})
          </p>
        </div>
        {cancellable ? (
          <form action={cancelRunAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton variant="danger" size="sm" pendingLabel="Cancelling…">
              <Ban className="size-4" aria-hidden="true" />
              Cancel run
            </SubmitButton>
          </form>
        ) : (
          <Link
            href={`/agents/${job.agent.slug}`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <Play className="size-4" aria-hidden="true" />
            Start another run
          </Link>
        )}
      </div>

      {job.status === "QUEUED" ? (
        <Alert tone="info" title="Waiting for the worker">
          This job is queued. It will execute only when the background worker runs. The worker
          endpoint is <code className="font-mono text-[11px]">POST /api/worker/run</code> and
          requires <code className="font-mono text-[11px]">WORKER_SECRET</code>.
        </Alert>
      ) : null}

      {job.status === "RUNNING" ? (
        <Alert tone="info" title="Lease active">
          A worker holds a two-minute lease on this job. If the worker stops responding, the lease
          expires and the job returns to the queue.
        </Alert>
      ) : null}

      {job.status === "FAILED" ? (
        <Alert tone="danger" title="Run failed">
          {job.error ?? "The agent failed without an error message."} The reserved run was
          refunded if the failure was permanent.
        </Alert>
      ) : null}

      {job.status === "CANCELLED" ? (
        <Alert tone="warning" title="Run cancelled">
          The job stopped before completion and the reserved run was refunded.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Steps" description="Each step is written as it happens." />
            {job.steps.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted">
                No steps recorded yet. A worker writes steps when execution begins.
              </p>
            ) : (
              <ol className="divide-y divide-line">
                {job.steps.map((step) => (
                  <li key={step.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-ink">{step.name}</p>
                      <Badge tone={STEP_TONES[step.status] ?? "neutral"}>{step.status}</Badge>
                      <span className="text-[11px] text-muted">attempt {step.attempt}</span>
                    </div>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                      {step.startedAt ? (
                        <span>started {formatRelativeTime(step.startedAt)}</span>
                      ) : null}
                      {step.finishedAt ? (
                        <span>finished {formatRelativeTime(step.finishedAt)}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" aria-hidden="true" />
                          in progress
                        </span>
                      )}
                    </p>
                    {step.detail && step.detail !== "{}" ? (
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-soft scrollbar-thin">
                        {pretty(step.detail)}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader title="Result" description="What the agent returned." />
            {job.result ? (
              <pre className="overflow-x-auto px-5 py-4 text-[11px] leading-relaxed text-ink-soft scrollbar-thin">
                {pretty(job.result)}
              </pre>
            ) : (
              <p className="px-5 py-8 text-sm text-muted">
                No result yet. Successful runs store their structured output here.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Job facts" />
            <dl className="divide-y divide-line px-5 text-[12px]">
              {[
                ["Agent", job.agent.name],
                ["Status", job.status],
                ["Attempts", `${job.attempts} of ${job.maxAttempts}`],
                ["Available at", formatDate(job.availableAt)],
                ["Started", job.startedAt ? formatDate(job.startedAt) : "Not started"],
                ["Finished", job.finishedAt ? formatDate(job.finishedAt) : "Not finished"],
                ["Locked by", job.lockedBy ?? "Not locked"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 py-3">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Input" description="Validated before queueing." />
            <pre className="overflow-x-auto px-5 py-4 text-[11px] leading-relaxed text-ink-soft scrollbar-thin">
              {pretty(job.input)}
            </pre>
          </Card>

          <Alert tone="shield" title="What this run can change">
            Executors write only inside this workspace: discovery stores source-attributed leads,
            research updates the lead description with verification notes, and qualification
            updates scores and stages while preserving statuses a person set. No email is sent and
            no external system is modified.
          </Alert>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Failed transient jobs retry with 15s, 30s, then 60s backoff. Permanent failures stop
            immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
