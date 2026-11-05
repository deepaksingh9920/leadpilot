import "server-only";

import { PermanentJobError } from "@/lib/jobs/policy";
import type { JobExecutor } from "@/server/services/jobs";

import { executeCompanyResearch } from "./company-research";
import { executeLeadFinder } from "./lead-finder";
import { executeLeadQualification } from "./qualification";

/**
 * The single place that maps an agent key to real work. Keep this in sync with
 * IMPLEMENTED_AGENT_KEYS in lib/agents/runtime.ts.
 */
export const agentExecutors: Record<string, JobExecutor> = {
  LEAD_FINDER: executeLeadFinder,
  COMPANY_RESEARCH: executeCompanyResearch,
  LEAD_QUALIFICATION: executeLeadQualification,
};

export const defaultJobExecutor: JobExecutor = async (context) => {
  const executor = agentExecutors[context.agentKey];
  if (!executor) {
    throw new PermanentJobError(
      `No executor is implemented for ${context.agentKey}. The run was rejected instead of pretending to work.`,
    );
  }
  return executor(context);
};
