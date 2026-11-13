import "server-only";

import { env } from "@/lib/env";
import {
  getAgentRuntimeStatus,
  type AgentRuntimeStatus,
  type ProviderCapabilities,
} from "@/lib/agents/runtime";
import { resolveEmailConfig } from "@/lib/email/send";
import { getAiConfig } from "@/server/services/ai";
import { getActiveLeadSource } from "@/server/services/lead-sources";

/**
 * Resolves capabilities for a workspace: stored workspace credentials first,
 * then the deployment defaults. Queueing uses the same function as execution,
 * so a workspace cannot start a run its credentials cannot finish.
 */
export async function getProviderCapabilities(
  workspaceId?: string,
): Promise<ProviderCapabilities> {
  const [ai, leadSource, email] = await Promise.all([
    getAiConfig(workspaceId),
    getActiveLeadSource(workspaceId),
    resolveEmailConfig(workspaceId),
  ]);

  return {
    aiConfigured: Boolean(ai),
    leadSourceConfigured: leadSource.ok,
    emailConfigured: email.ok,
    runtimeReady: env.agentRuntimeReady,
  };
}

export async function getAgentStatus(
  agentKey: string,
  workspaceId?: string,
): Promise<AgentRuntimeStatus> {
  return getAgentRuntimeStatus(agentKey, await getProviderCapabilities(workspaceId));
}
