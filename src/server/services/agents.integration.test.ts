import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createRunnableAgent,
  createTempDatabase,
  createTestTenant,
} from "@/test/temp-db";

// Provider adapters read configuration when their modules are first imported, so
// every flag must be set before the dynamic imports below. Network calls are
// stubbed; no real provider is contacted.
const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;
process.env.AGENT_RUNTIME_READY = "true";
process.env.AI_API_KEY = "test-ai-key";
process.env.AI_MODEL = "test-model";
process.env.AI_BASE_URL = "https://ai.test/v1";
process.env.AI_TIMEOUT_MS = "5000";
process.env.PRIMARY_LEAD_SOURCE = "apollo";
process.env.APOLLO_API_KEY = "test-apollo-key";
process.env.APOLLO_API_BASE_URL = "https://apollo.test/v1";

const { db } = await import("@/lib/db");
const { claimJobs, createJob, processJob } = await import("@/server/services/jobs");

type Tenant = Awaited<ReturnType<typeof createTestTenant>>;

const AGENTS = [
  { key: "LEAD_FINDER", slug: "lead-finder-exec-test" },
  { key: "COMPANY_RESEARCH", slug: "company-research-exec-test" },
  { key: "LEAD_QUALIFICATION", slug: "lead-qualification-exec-test" },
];

let tenant: Tenant;
let limitedTenant: Tenant;

let apolloPayload: unknown = { people: [] };
let aiContent = "{}";
let aiRequests: { system: string; user: string }[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function setupAgents(target: Tenant): Promise<void> {
  for (const agent of AGENTS) {
    await createRunnableAgent(db, {
      workspaceId: target.workspace.id,
      planId: target.plan.id,
      key: agent.key,
      slug: agent.slug,
    });
  }
}

function parseJson(value: string | null): Record<string, unknown> {
  return JSON.parse(value ?? "{}") as Record<string, unknown>;
}

async function runUsage(target: Tenant): Promise<number> {
  const counter = await db.usageCounter.findFirst({
    where: { workspaceId: target.workspace.id, metric: "agent_runs_per_month" },
  });
  return counter?.used ?? 0;
}

type JobRow = {
  id: string;
  status: string;
  result: string | null;
  error: string | null;
  attempts: number;
};

async function runJob(
  target: Tenant,
  agentKey: string,
  input: Record<string, unknown>,
): Promise<{ jobId: string; job: JobRow }> {
  const created = await createJob({
    workspaceId: target.workspace.id,
    userId: target.user.id,
    agentKey,
    input,
  });
  if (!created.ok) throw new Error(`createJob failed: ${created.code} ${created.message}`);

  await db.job.update({
    where: { id: created.jobId },
    data: { availableAt: new Date(Date.now() - 60_000) },
  });

  const workerId = `worker-${created.jobId}`;
  const claimed = await claimJobs(workerId, 1);
  const claim = claimed.find((job) => job.id === created.jobId);
  if (!claim) throw new Error("The queued job was not claimed.");

  await processJob(claim, workerId);
  const job = await db.job.findUniqueOrThrow({ where: { id: created.jobId } });
  return { jobId: created.jobId, job };
}

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url === "https://apollo.test/v1/mixed_people/api_search") {
      return jsonResponse(apolloPayload);
    }

    if (url === "https://ai.test/v1/chat/completions") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: { role: string; content: string }[];
      };
      const system = body.messages?.find((message) => message.role === "system")?.content ?? "";
      const user = body.messages?.find((message) => message.role === "user")?.content ?? "";
      aiRequests.push({ system, user });
      return jsonResponse({
        choices: [{ message: { content: aiContent }, finish_reason: "stop" }],
      });
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  });

  tenant = await createTestTenant(db, { key: "agents", leadLimit: 100, runLimit: 50 });
  await setupAgents(tenant);

  limitedTenant = await createTestTenant(db, { key: "agents-limit", leadLimit: 1, runLimit: 10 });
  await setupAgents(limitedTenant);
});

afterEach(() => {
  apolloPayload = { people: [] };
  aiContent = "{}";
  aiRequests = [];
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await db.$disconnect();
  temp.cleanup();
});

describe("Lead Finder executor", () => {
  it("stores source-attributed leads, dedupes the batch, and reports skipped rows", async () => {
    apolloPayload = {
      people: [
        {
          id: "apollo-1",
          name: "Ada Lovelace",
          title: "CTO",
          email: "Ada@Analytical.Example",
          linkedin_url: "https://www.linkedin.com/in/ada",
          phone_numbers: [{ sanitized_number: "+1-555-0100" }],
          organization: {
            name: "Analytical Engines",
            primary_domain: "analytical.example",
            website_url: "https://analytical.example",
            industry: "SaaS",
            city: "London",
            country: "UK",
            estimated_num_employees: 120,
            keywords: ["analytics"],
          },
        },
        {
          id: "apollo-2",
          name: "Ada Duplicate",
          email: "ada@analytical.example",
          organization: { name: "Analytical Engines", primary_domain: "analytical.example" },
        },
        { id: "apollo-3", organization: {} },
        { organization: {} },
      ],
    };

    const { jobId, job } = await runJob(tenant, "LEAD_FINDER", {
      industry: "SaaS",
      region: "UK",
      limit: 5,
    });

    expect(job.status).toBe("SUCCEEDED");
    const result = parseJson(job.result);
    expect(result).toMatchObject({
      provider: "apollo",
      found: 2,
      stored: 1,
      duplicates: 1,
      skipped: 2,
    });

    const lead = await db.lead.findFirstOrThrow({
      where: { workspaceId: tenant.workspace.id, companyName: "Analytical Engines" },
      include: {
        source: true,
        verifications: { orderBy: { field: "asc" } },
        activities: true,
      },
    });

    expect(lead).toMatchObject({
      domain: "analytical.example",
      industry: "SaaS",
      location: "London, UK",
      employeeCount: 120,
      contactName: "Ada Lovelace",
      contactEmail: "ada@analytical.example",
      contactPhone: "+1-555-0100",
      sourceRecordId: "apollo-1",
      sourceUrl: "https://www.linkedin.com/in/ada",
      dedupeKey: "email:ada@analytical.example",
      verificationStatus: "PARTIAL",
    });
    expect(lead.retrievedAt).toBeInstanceOf(Date);
    expect(lead.source).toMatchObject({
      provider: "apollo",
      type: "API",
      name: "Apollo",
      termsUrl: "https://www.apollo.io/terms",
    });
    expect(lead.source?.licenseNote).toContain("Apollo");

    expect(lead.verifications.map((row) => row.field)).toEqual([
      "companyName",
      "contactEmail",
      "contactPhone",
    ]);
    expect(lead.verifications.every((row) => row.status === "PARTIAL")).toBe(true);
    expect(lead.activities.some((activity) => activity.type === "DISCOVERED")).toBe(true);

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "agent.leads_discovered" },
    });
    expect(audit).not.toBeNull();
    expect(parseJson(audit?.metadata ?? null)).toMatchObject({ provider: "apollo", stored: 1 });

    const steps = await db.jobStep.findMany({ where: { jobId } });
    for (const name of ["resolve-source", "search-source", "store-leads"]) {
      expect(steps.find((step) => step.name === name)?.status).toBe("SUCCEEDED");
    }

    // Running the same search again must not duplicate the business.
    const before = await db.lead.count({
      where: { workspaceId: tenant.workspace.id, companyName: "Analytical Engines" },
    });
    const second = await runJob(tenant, "LEAD_FINDER", {
      industry: "SaaS",
      region: "UK",
      limit: 5,
    });
    const secondResult = parseJson(second.job.result);
    expect(second.job.status).toBe("SUCCEEDED");
    expect(secondResult.stored).toBe(0);
    expect(secondResult.duplicates).toBe(2);
    expect(
      await db.lead.count({
        where: { workspaceId: tenant.workspace.id, companyName: "Analytical Engines" },
      }),
    ).toBe(before);
  });
});

describe("Lead Qualification executor", () => {
  it("applies grounded scores and preserves a human-owned status", async () => {
    const lead = await db.lead.create({
      data: {
        workspaceId: tenant.workspace.id,
        companyName: "Northwind Analytics",
        domain: "northwind.example",
        industry: "SaaS",
        location: "Seattle",
        employeeCount: 120,
        contactEmail: "hello@northwind.example",
        sourceUrl: "https://northwind.example",
        dedupeKey: "domain:northwind.example",
      },
    });

    aiContent = JSON.stringify({
      score: 82,
      suggestedStatus: "QUALIFIED",
      reasons: ["Industry matches the ICP", "Employee count is in range"],
      confidence: "high",
      insufficientData: false,
    });

    const first = await runJob(tenant, "LEAD_QUALIFICATION", { leadIds: [lead.id] });
    expect(first.job.status).toBe("SUCCEEDED");

    const scored = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(scored.score).toBe(82);
    expect(scored.status).toBe("QUALIFIED");
    expect(JSON.parse(scored.scoreReasons)).toEqual([
      "Industry matches the ICP",
      "Employee count is in range",
    ]);

    expect(aiRequests[0].user).toContain("Northwind Analytics");
    expect(aiRequests[0].user).toContain("hello@northwind.example");
    expect(aiRequests[0].system).toContain("do not invent facts");

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "agent.leads_qualified" },
    });
    expect(audit).not.toBeNull();

    // A human moved the lead to CONTACTED. Automated qualification may update
    // the score but must not pull the lead back into an earlier pipeline stage.
    await db.lead.update({ where: { id: lead.id }, data: { status: "CONTACTED" } });
    aiContent = JSON.stringify({
      score: 40,
      suggestedStatus: "DISQUALIFIED",
      reasons: ["Budget signal is absent"],
      confidence: "medium",
      insufficientData: false,
    });

    const second = await runJob(tenant, "LEAD_QUALIFICATION", { leadIds: [lead.id] });
    expect(second.job.status).toBe("SUCCEEDED");

    const preserved = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(preserved.score).toBe(40);
    expect(preserved.status).toBe("CONTACTED");

    const preservedActivity = await db.leadActivity.findFirst({
      where: {
        leadId: lead.id,
        type: "QUALIFIED",
        detail: { contains: '"previousStatus":"CONTACTED"' },
      },
    });
    expect(preservedActivity).not.toBeNull();
    expect(parseJson(preservedActivity?.detail ?? null)).toMatchObject({
      previousStatus: "CONTACTED",
      status: "CONTACTED",
    });
  });
});

describe("Company Research executor", () => {
  it("saves a grounded summary and marks the description as partially verified", async () => {
    const lead = await db.lead.create({
      data: {
        workspaceId: tenant.workspace.id,
        companyName: "Blue Harbor Logistics",
        domain: "blueharbor.example",
        industry: "Logistics",
        location: "Oakland",
        sourceUrl: "https://blueharbor.example",
        dedupeKey: "domain:blueharbor.example",
      },
    });

    aiContent = JSON.stringify({
      summary: "Blue Harbor is a regional logistics operator serving cold-chain routes.",
      likelyNeeds: ["Route optimization"],
      confidence: "medium",
      insufficientData: false,
      rationale: "Derived from the stored industry and location.",
    });

    const { jobId, job } = await runJob(tenant, "COMPANY_RESEARCH", { leadId: lead.id });
    expect(job.status).toBe("SUCCEEDED");
    expect(parseJson(job.result).descriptionUpdated).toBe(true);

    const researched = await db.lead.findUniqueOrThrow({
      where: { id: lead.id },
      include: { verifications: true, activities: true },
    });
    expect(researched.description).toBe(
      "Blue Harbor is a regional logistics operator serving cold-chain routes.",
    );
    const verification = researched.verifications.find((row) => row.field === "description");
    expect(verification).toMatchObject({
      status: "PARTIAL",
      sourceUrl: "https://blueharbor.example",
    });
    expect(verification?.note).toContain("not independently verified");
    expect(researched.activities.some((activity) => activity.type === "RESEARCHED")).toBe(true);

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "agent.lead_researched" },
    });
    expect(audit).not.toBeNull();

    const steps = await db.jobStep.findMany({ where: { jobId } });
    expect(steps.find((step) => step.name === "save-research")?.status).toBe("SUCCEEDED");
  });

  it("keeps the record untouched when the model reports insufficient data", async () => {
    const lead = await db.lead.create({
      data: {
        workspaceId: tenant.workspace.id,
        companyName: "Sparse Co",
        dedupeKey: "company:sparse co|",
      },
    });

    aiContent = JSON.stringify({
      summary: "Not enough stored information to describe this company.",
      likelyNeeds: [],
      confidence: "low",
      insufficientData: true,
      rationale: "Only a company name is stored.",
    });

    const { jobId, job } = await runJob(tenant, "COMPANY_RESEARCH", { leadId: lead.id });
    expect(job.status).toBe("SUCCEEDED");
    expect(parseJson(job.result).insufficientData).toBe(true);

    const untouched = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(untouched.description).toBeNull();

    const activity = await db.leadActivity.findFirst({
      where: { leadId: lead.id, type: "RESEARCHED" },
    });
    expect(parseJson(activity?.detail ?? null)).toMatchObject({ insufficientData: true });

    const steps = await db.jobStep.findMany({ where: { jobId } });
    expect(steps.find((step) => step.name === "save-research")?.status).toBe("SKIPPED");
  });
});

describe("failure handling", () => {
  it("fails permanently and refunds the run when the discovery plan limit is reached", async () => {
    apolloPayload = {
      people: [
        { id: "limit-1", organization: { name: "Limit One", primary_domain: "limit-one.example" } },
        { id: "limit-2", organization: { name: "Limit Two", primary_domain: "limit-two.example" } },
      ],
    };

    const before = await runUsage(limitedTenant);
    const { job } = await runJob(limitedTenant, "LEAD_FINDER", {
      industry: "SaaS",
      region: "US",
      limit: 5,
    });

    expect(job.status).toBe("FAILED");
    expect(job.error).toContain("Leads discovered limit reached");
    expect(await runUsage(limitedTenant)).toBe(before);
    expect(await db.lead.count({ where: { workspaceId: limitedTenant.workspace.id } })).toBe(0);
    expect(
      await db.leadSource.count({ where: { workspaceId: limitedTenant.workspace.id } }),
    ).toBe(0);

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: limitedTenant.workspace.id, action: "agent.run_failed" },
    });
    expect(audit).not.toBeNull();
  });

  it("requeues invalid AI output without writing partial qualification results", async () => {
    const lead = await db.lead.create({
      data: {
        workspaceId: tenant.workspace.id,
        companyName: "Retry Co",
        dedupeKey: "company:retry co|",
      },
    });

    aiContent = JSON.stringify({
      score: 150,
      suggestedStatus: "QUALIFIED",
      reasons: ["Out of range"],
      confidence: "high",
      insufficientData: false,
    });

    const { jobId, job } = await runJob(tenant, "LEAD_QUALIFICATION", { leadIds: [lead.id] });

    expect(job.status).toBe("QUEUED");
    expect(job.attempts).toBe(1);
    expect(job.error).toContain("schema");

    const untouched = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(untouched.score).toBe(0);
    expect(untouched.status).toBe("NEW");
    expect(
      await db.leadActivity.count({ where: { leadId: lead.id, type: "QUALIFIED" } }),
    ).toBe(0);

    const steps = await db.jobStep.findMany({ where: { jobId } });
    expect(steps.find((step) => step.name === "score-fit")?.status).toBe("FAILED");
  });
});
