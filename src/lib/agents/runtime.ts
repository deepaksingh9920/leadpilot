/**
 * Which provider each agent needs, and whether its runtime can execute in this
 * build. Keeping this pure makes the gating testable and prevents the UI and the
 * server action from drifting apart.
 */

export type ProviderKey = "ai" | "lead_source" | "email";

export type ProviderCapabilities = {
  aiConfigured: boolean;
  leadSourceConfigured: boolean;
  emailConfigured: boolean;
  /** Live agent adapters are implemented in Phase 4. */
  runtimeReady: boolean;
};

export type AgentRuntimeStatus =
  | { runnable: true; provider: ProviderKey | null }
  | {
      runnable: false;
      provider: ProviderKey | null;
      code: "PROVIDER_MISSING" | "RUNTIME_NOT_READY" | "UNKNOWN_AGENT";
      message: string;
    };

type Requirement = {
  provider: ProviderKey | null;
  setupKey: string;
  setupHint: string;
};

const REQUIREMENTS: Record<string, Requirement> = {
  LEAD_FINDER: {
    provider: "lead_source",
    setupKey: "APOLLO_API_KEY / PDL_API_KEY / GOOGLE_PLACES_API_KEY",
    setupHint: "Connect a licensed lead source on the Integrations page.",
  },
  COMPANY_RESEARCH: {
    provider: "ai",
    setupKey: "AI_API_KEY, AI_MODEL",
    setupHint: "Configure an OpenAI-compatible AI provider on the Integrations page.",
  },
  LEAD_QUALIFICATION: {
    provider: "ai",
    setupKey: "AI_API_KEY, AI_MODEL",
    setupHint: "Configure an OpenAI-compatible AI provider on the Integrations page.",
  },
  COMPETITOR_RESEARCH: {
    provider: "ai",
    setupKey: "AI_API_KEY, AI_MODEL",
    setupHint: "Configure an OpenAI-compatible AI provider on the Integrations page.",
  },
  EMAIL_OUTREACH: {
    provider: "ai",
    setupKey: "AI_API_KEY, AI_MODEL",
    setupHint: "Outreach drafting and approval arrive with the outreach phase.",
  },
  FOLLOW_UP: {
    provider: "ai",
    setupKey: "AI_API_KEY, AI_MODEL",
    setupHint: "Follow-up scheduling arrives with the outreach phase.",
  },
};

export const OUTREACH_AGENT_KEYS = new Set(["EMAIL_OUTREACH", "FOLLOW_UP"]);

export function getAgentRuntimeStatus(
  agentKey: string,
  capabilities: ProviderCapabilities,
): AgentRuntimeStatus {
  const requirement = REQUIREMENTS[agentKey];
  if (!requirement) {
    return {
      runnable: false,
      provider: null,
      code: "UNKNOWN_AGENT",
      message: "This agent is not registered for execution.",
    };
  }

  if (OUTREACH_AGENT_KEYS.has(agentKey)) {
    return {
      runnable: false,
      provider: requirement.provider,
      code: "RUNTIME_NOT_READY",
      message: "This agent creates drafts only. Outreach approval and sending arrive in the next phase.",
    };
  }

  if (requirement.provider === "ai" && !capabilities.aiConfigured) {
    return {
      runnable: false,
      provider: "ai",
      code: "PROVIDER_MISSING",
      message: `No AI provider is configured. Set ${requirement.setupKey} to enable this agent. ${requirement.setupHint}`,
    };
  }

  if (requirement.provider === "lead_source" && !capabilities.leadSourceConfigured) {
    return {
      runnable: false,
      provider: "lead_source",
      code: "PROVIDER_MISSING",
      message: `No lead source is configured. Set ${requirement.setupKey} to enable this agent. ${requirement.setupHint}`,
    };
  }

  if (!capabilities.runtimeReady) {
    return {
      runnable: false,
      provider: requirement.provider,
      code: "RUNTIME_NOT_READY",
      message:
        "The provider is configured, but the live adapter for this agent is part of Phase 4. The job queue is ready; runs stay disabled until that adapter ships.",
    };
  }

  return { runnable: true, provider: requirement.provider };
}

export function providerLabel(provider: ProviderKey | null): string {
  if (provider === "ai") return "AI provider";
  if (provider === "lead_source") return "Lead source";
  if (provider === "email") return "Email provider";
  return "No provider";
}
