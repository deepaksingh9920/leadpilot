import "server-only";

import { db } from "@/lib/db";
import { PermanentJobError } from "@/lib/jobs/policy";
import { researchOutputSchema } from "@/lib/agents/output-schemas";
import type { JobExecutionContext } from "@/server/services/jobs";
import { completeStructured } from "@/server/services/ai";

import { throwAsJobError } from "./errors";
import { groundedLeadPayload } from "./lead-payload";
import { researchMessages } from "./prompts";

export async function executeCompanyResearch(
  context: JobExecutionContext,
): Promise<Record<string, unknown>> {
  const leadId = typeof context.input.leadId === "string" ? context.input.leadId.trim() : "";
  if (!leadId) throw new PermanentJobError("Company Research needs a leadId.");

  const lead = await db.lead.findFirst({
    where: { id: leadId, workspaceId: context.workspaceId, deletedAt: null },
    include: {
      source: { select: { name: true, provider: true, termsUrl: true, licenseNote: true } },
      verifications: { select: { field: true, status: true, sourceUrl: true, note: true } },
    },
  });
  if (!lead) throw new PermanentJobError("Lead not found in this workspace.");

  await context.step("load-lead", "SUCCEEDED", {
    leadId: lead.id,
    companyName: lead.companyName,
  });

  await context.step("research", "RUNNING", { model: "configured AI model" });
  let researched;
  try {
    researched = await completeStructured({
      schema: researchOutputSchema,
      messages: researchMessages(groundedLeadPayload(lead)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI research failed";
    await context.step("research", "FAILED", { message: message.slice(0, 500) });
    throwAsJobError(error);
  }

  const output = researched.data;
  await context.step("research", "SUCCEEDED", {
    model: researched.model,
    confidence: output.confidence,
    insufficientData: output.insufficientData,
  });

  if (output.insufficientData) {
    await db.leadActivity.create({
      data: {
        leadId: lead.id,
        type: "RESEARCHED",
        detail: JSON.stringify({
          insufficientData: true,
          summary: output.summary,
          rationale: output.rationale,
          model: researched.model,
        }),
      },
    });

    await context.step("save-research", "SKIPPED", {
      reason: "The stored record did not contain enough evidence for a grounded summary.",
    });

    return {
      leadId: lead.id,
      insufficientData: true,
      summary: output.summary,
      confidence: output.confidence,
      descriptionUpdated: false,
      model: researched.model,
    };
  }

  const descriptionUpdated = !lead.description?.trim();
  const verificationStatus = lead.sourceUrl ? "PARTIAL" : "UNVERIFIED";
  const note = `AI summary generated from stored lead fields by ${researched.model}; not independently verified.`;

  await db.$transaction(async (tx) => {
    if (descriptionUpdated) {
      await tx.lead.update({
        where: { id: lead.id },
        data: { description: output.summary },
      });
    }

    await tx.leadFieldVerification.upsert({
      where: { leadId_field: { leadId: lead.id, field: "description" } },
      update: {
        status: verificationStatus,
        sourceUrl: lead.sourceUrl,
        checkedAt: new Date(),
        note,
      },
      create: {
        leadId: lead.id,
        field: "description",
        status: verificationStatus,
        sourceUrl: lead.sourceUrl,
        checkedAt: new Date(),
        note,
      },
    });

    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        type: "RESEARCHED",
        detail: JSON.stringify({
          insufficientData: false,
          summary: output.summary,
          likelyNeeds: output.likelyNeeds,
          confidence: output.confidence,
          rationale: output.rationale,
          model: researched.model,
          descriptionUpdated,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: context.workspaceId,
        action: "agent.lead_researched",
        entityType: "Lead",
        entityId: lead.id,
        metadata: JSON.stringify({
          jobId: context.jobId,
          model: researched.model,
          confidence: output.confidence,
          descriptionUpdated,
        }),
      },
    });
  });

  await context.step("save-research", "SUCCEEDED", {
    descriptionUpdated,
    verificationStatus,
  });

  return {
    leadId: lead.id,
    insufficientData: false,
    summary: output.summary,
    likelyNeeds: output.likelyNeeds,
    confidence: output.confidence,
    descriptionUpdated,
    model: researched.model,
  };
}
