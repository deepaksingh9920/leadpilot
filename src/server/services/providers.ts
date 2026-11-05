import "server-only";

import { env } from "@/lib/env";
import {
  getAgentRuntimeStatus,
  type AgentRuntimeStatus,
  type ProviderCapabilities,
} from "@/lib/agents/runtime";

/**
 * Live adapters are implemented in Phase 4. The flag exists so an operator
 * cannot accidentally turn on execution before the adapters exist.
 */
export function getProviderCapabilities(): ProviderCapabilities {
  return {
    aiConfigured: env.aiConfigured,
    leadSourceConfigured: env.leadSourceConfigured,
    emailConfigured: env.emailConfigured,
    runtimeReady: env.agentRuntimeReady,
  };
}

export function getAgentStatus(agentKey: string): AgentRuntimeStatus {
  return getAgentRuntimeStatus(agentKey, getProviderCapabilities());
}
