import "server-only";

import { db } from "@/lib/db";
import { PermanentJobError } from "@/lib/jobs/policy";
import {
  qualificationOutputSchema,
  type QualificationOutput,
} from "@/lib/agents/output-schemas";
import type { JobExecutionContext } from "@/server/services/jobs";
import { completeStructured } from "@/server/services/ai";

import { throwAsJobError } from "./errors";
import { groundedLeadPayload, type GroundedLead } from "./lead-payload";
import { qualificationMessages } from "./prompts";

const MAX_LEADS = 25;
const HUMAN_OWNED_STATUSES = new Set(["CONTACTED", "CONVERTED"]);

function readLeadIds(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

type Evaluation = {
  lead: GroundedLead & { id: string };
  output: QualificationOutput;
  model: string;
};

export async function executeLeadQualification(
  context: JobExecutionContext,
): Promise<Record<string, unknown>> {
  const leadIds = readLeadIds(context.input.leadIds);
  if (leadIds.length === 0) {
    throw new PermanentJobError("Lead Qualification needs at least one leadId.");
  }
  if (leadIds.length > MAX_LEADS) {
    throw new PermanentJobError(`Qualify at most ${MAX_LEADS} leads per run.`);
  }

  const found = await db.lead.findMany({
    where: {
      id: { in: leadIds },
      workspaceId: context.workspaceId,
      deletedAt: null,
    },
    include: {
      source: { select: { name: true, provider: true, termsUrl: true } },
      verifications: { select: { field: true, status: true, sourceUrl: true, note: true } },
    },
  });
  if (found.length === 0) {
    throw new PermanentJobError("None of the supplied leads exist in this workspace.");
  }

  const byId = new Map(found.map((lead) => [lead.id, lead]));
  const missing = leadIds.filter((id) => !byId.has(id));

  await context.step("load-leads", "SUCCEEDED", {
    requested: leadIds.length,
    found: found.length,
    missing,
  });

  await context.step("score-fit", "RUNNING", { leads: found.length });
  const evaluations: Evaluation[] = [];
  for (const lead of found) {
    try {
      const result = await completeStructured({
        schema: qualificationOutputSchema,
        messages: qualificationMessages(groundedLeadPayload(lead)),
      });
      evaluations.push({ lead, output: result.data, model: result.model });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI qualification failed";
      await context.step("score-fit", "FAILED", {
        leadId: lead.id,
        message: message.slice(0, 500),
      });
      throwAsJobError(error);
    }
  }

  await context.step("score-fit", "SUCCEEDED", {
    evaluated: evaluations.length,
    insufficientData: evaluations.filter((item) => item.output.insufficientData).length,
  });

  const results: Array<{
    leadId: string;
    score: number;
    status: string;
    insufficientData: boolean;
  }> = [];

  await context.step("apply-scores", "RUNNING");
  const applied = await db.$transaction(async (tx) => {
    let updated = 0;
    let skipped = 0;

    for (const evaluation of evaluations) {
      const { lead, output, model } = evaluation;
      const previousStatus = lead.status;

      if (output.insufficientData) {
        skipped += 1;
        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            type: "QUALIFICATION_SKIPPED",
            detail: JSON.stringify({
              reasons: output.reasons,
              confidence: output.confidence,
              model,
              insufficientData: true,
            }),
          },
        });
        results.push({
          leadId: lead.id,
          score: lead.score,
          status: previousStatus,
          insufficientData: true,
        });
        continue;
      }

      const nextStatus = HUMAN_OWNED_STATUSES.has(previousStatus)
        ? previousStatus
        : output.suggestedStatus;

      await tx.lead.update({
        where: { id: lead.id },
        data: {
          score: output.score,
          scoreReasons: JSON.stringify(output.reasons),
          status: nextStatus,
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          type: "QUALIFIED",
          detail: JSON.stringify({
            score: output.score,
            previousStatus,
            status: nextStatus,
            reasons: output.reasons,
            confidence: output.confidence,
            model,
            insufficientData: false,
          }),
        },
      });

      updated += 1;
      results.push({
        leadId: lead.id,
        score: output.score,
        status: nextStatus,
        insufficientData: false,
      });
    }

    await tx.auditLog.create({
      data: {
        workspaceId: context.workspaceId,
        action: "agent.leads_qualified",
        entityType: "Job",
        entityId: context.jobId,
        metadata: JSON.stringify({
          evaluated: evaluations.length,
          updated,
          skipped,
          missing: missing.length,
        }),
      },
    });

    return { updated, skipped };
  });

  await context.step("apply-scores", "SUCCEEDED", {
    updated: applied.updated,
    skipped: applied.skipped,
    missing: missing.length,
  });

  return {
    requested: leadIds.length,
    evaluated: evaluations.length,
    updated: applied.updated,
    skipped: applied.skipped + missing.length,
    missing,
    results,
  };
}
