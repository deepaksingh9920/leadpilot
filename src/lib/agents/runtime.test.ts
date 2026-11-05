import { describe, expect, it } from "vitest";

import { getAgentRuntimeStatus } from "@/lib/agents/runtime";

const none = {
  aiConfigured: false,
  leadSourceConfigured: false,
  emailConfigured: false,
  runtimeReady: false,
};

describe("agent runtime gating", () => {
  it("rejects unknown agents", () => {
    const status = getAgentRuntimeStatus("NOT_AN_AGENT", none);
    expect(status.runnable).toBe(false);
    if (status.runnable) return;
    expect(status.code).toBe("UNKNOWN_AGENT");
  });

  it("requires a provider before runtime readiness", () => {
    const status = getAgentRuntimeStatus("COMPANY_RESEARCH", none);
    expect(status.runnable).toBe(false);
    if (status.runnable) return;
    expect(status.code).toBe("PROVIDER_MISSING");
    expect(status.message).toContain("AI_API_KEY");
  });

  it("requires a lead source for discovery", () => {
    const status = getAgentRuntimeStatus("LEAD_FINDER", none);
    expect(status.runnable).toBe(false);
    if (status.runnable) return;
    expect(status.code).toBe("PROVIDER_MISSING");
    expect(status.message).toContain("lead source");
  });

  it("keeps outreach agents draft-only even when fully configured", () => {
    const status = getAgentRuntimeStatus("EMAIL_OUTREACH", {
      ...none,
      aiConfigured: true,
      runtimeReady: true,
    });
    expect(status.runnable).toBe(false);
    if (status.runnable) return;
    expect(status.code).toBe("RUNTIME_NOT_READY");
    expect(status.message).toContain("drafts only");
  });

  it("stays gated while the operator has not enabled execution", () => {
    const status = getAgentRuntimeStatus("LEAD_QUALIFICATION", {
      ...none,
      aiConfigured: true,
      runtimeReady: false,
    });
    expect(status.runnable).toBe(false);
    if (status.runnable) return;
    expect(status.code).toBe("RUNTIME_NOT_READY");
    expect(status.message).toContain("AGENT_RUNTIME_READY");
  });

  it("does not advertise agents without an executor", () => {
    const status = getAgentRuntimeStatus("COMPETITOR_RESEARCH", {
      ...none,
      aiConfigured: true,
      runtimeReady: true,
    });
    expect(status.runnable).toBe(false);
    if (status.runnable) return;
    expect(status.code).toBe("RUNTIME_NOT_READY");
    expect(status.message).toContain("executor");
  });

  it("is runnable only when provider and runtime are both ready", () => {
    expect(
      getAgentRuntimeStatus("LEAD_QUALIFICATION", { ...none, aiConfigured: true, runtimeReady: true }),
    ).toEqual({ runnable: true, provider: "ai" });

    expect(
      getAgentRuntimeStatus("LEAD_FINDER", { ...none, leadSourceConfigured: true, runtimeReady: true }),
    ).toEqual({ runnable: true, provider: "lead_source" });
  });
});
