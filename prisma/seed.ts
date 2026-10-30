import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const agents = [
  {
    key: "LEAD_FINDER",
    name: "Lead Finder",
    slug: "lead-finder",
    description:
      "Find businesses that match your ideal customer profile using permitted, source-attributed data.",
    category: "Discovery",
    stage: "discover",
    icon: "search",
    creditCost: 1,
    requiresApproval: false,
    sortOrder: 1,
    inputSchema: JSON.stringify({
      type: "object",
      properties: {
        industry: { type: "string" },
        region: { type: "string" },
        companySize: { type: "string" },
        targetCustomerType: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["industry", "region"],
    }),
  },
  {
    key: "COMPANY_RESEARCH",
    name: "Company Research",
    slug: "company-research",
    description:
      "Summarize a company's services, positioning, and likely needs using retrieved source content.",
    category: "Research",
    stage: "research",
    icon: "building-2",
    creditCost: 1,
    requiresApproval: false,
    sortOrder: 2,
    inputSchema: JSON.stringify({
      type: "object",
      properties: { leadId: { type: "string" } },
      required: ["leadId"],
    }),
  },
  {
    key: "LEAD_QUALIFICATION",
    name: "Lead Qualification",
    slug: "lead-qualification",
    description:
      "Score prospects on fit and data confidence, with a transparent and auditable breakdown.",
    category: "Qualification",
    stage: "qualify",
    icon: "gauge",
    creditCost: 1,
    requiresApproval: false,
    sortOrder: 3,
    inputSchema: JSON.stringify({
      type: "object",
      properties: { leadIds: { type: "array", items: { type: "string" } } },
      required: ["leadIds"],
    }),
  },
  {
    key: "EMAIL_OUTREACH",
    name: "Email Outreach",
    slug: "email-outreach",
    description:
      "Draft personalized sales emails grounded in stored lead data. Every message waits for your approval.",
    category: "Outreach",
    stage: "draft",
    icon: "mail",
    creditCost: 2,
    requiresApproval: true,
    sortOrder: 4,
    inputSchema: JSON.stringify({
      type: "object",
      properties: { leadIds: { type: "array", items: { type: "string" } } },
      required: ["leadIds"],
    }),
  },
  {
    key: "FOLLOW_UP",
    name: "Follow-up",
    slug: "follow-up",
    description:
      "Track who needs a nudge, surface due follow-ups, and suggest the next touch for your review.",
    category: "Outreach",
    stage: "follow_up",
    icon: "calendar-clock",
    creditCost: 1,
    requiresApproval: true,
    sortOrder: 5,
    inputSchema: JSON.stringify({
      type: "object",
      properties: { campaignId: { type: "string" } },
    }),
  },
  {
    key: "COMPETITOR_RESEARCH",
    name: "Competitor Research",
    slug: "competitor-research",
    description:
      "Map competitors and potential market gaps from permitted public information, with sources.",
    category: "Research",
    stage: "research",
    icon: "radar",
    creditCost: 2,
    requiresApproval: false,
    sortOrder: 6,
    inputSchema: JSON.stringify({
      type: "object",
      properties: {
        industry: { type: "string" },
        region: { type: "string" },
      },
      required: ["industry"],
    }),
  },
] as const;

const plans = [
  {
    key: "free",
    name: "Free",
    description: "Test the workflow with a small number of sourced leads.",
    monthlyPrice: 0,
    yearlyPrice: 0,
    sortOrder: 1,
    limits: {
      leads_per_month: 50,
      agent_runs_per_month: 10,
      seats: 1,
      workspaces: 1,
      sends_per_day: 10,
      exports_per_month: 2,
    },
    agents: ["LEAD_FINDER", "LEAD_QUALIFICATION"],
  },
  {
    key: "starter",
    name: "Starter",
    description: "For solo founders and consultants building a repeatable pipeline.",
    monthlyPrice: 4900,
    yearlyPrice: 47000,
    sortOrder: 2,
    limits: {
      leads_per_month: 500,
      agent_runs_per_month: 100,
      seats: 3,
      workspaces: 1,
      sends_per_day: 50,
      exports_per_month: 10,
    },
    agents: ["LEAD_FINDER", "LEAD_QUALIFICATION", "COMPANY_RESEARCH", "EMAIL_OUTREACH"],
  },
  {
    key: "professional",
    name: "Professional",
    description: "For growing sales teams running multiple campaigns and research tracks.",
    monthlyPrice: 14900,
    yearlyPrice: 143000,
    sortOrder: 3,
    limits: {
      leads_per_month: 2500,
      agent_runs_per_month: 500,
      seats: 10,
      workspaces: 3,
      sends_per_day: 200,
      exports_per_month: 50,
    },
    agents: agents.map((agent) => agent.key),
  },
  {
    key: "agency",
    name: "Agency",
    description: "For agencies managing prospecting across multiple client workspaces.",
    monthlyPrice: 39900,
    yearlyPrice: 383000,
    sortOrder: 4,
    limits: {
      leads_per_month: 10000,
      agent_runs_per_month: 2000,
      seats: 25,
      workspaces: 10,
      sends_per_day: 500,
      exports_per_month: 200,
    },
    agents: agents.map((agent) => agent.key),
  },
] as const;

async function seedAgents() {
  for (const agent of agents) {
    await prisma.agentDefinition.upsert({
      where: { key: agent.key },
      update: {
        name: agent.name,
        slug: agent.slug,
        description: agent.description,
        category: agent.category,
        stage: agent.stage,
        icon: agent.icon,
        creditCost: agent.creditCost,
        requiresApproval: agent.requiresApproval,
        inputSchema: agent.inputSchema,
        sortOrder: agent.sortOrder,
        isActive: true,
      },
      create: {
        key: agent.key,
        name: agent.name,
        slug: agent.slug,
        description: agent.description,
        category: agent.category,
        stage: agent.stage,
        icon: agent.icon,
        creditCost: agent.creditCost,
        requiresApproval: agent.requiresApproval,
        inputSchema: agent.inputSchema,
        sortOrder: agent.sortOrder,
        isActive: true,
      },
    });
  }
  console.log(`Seeded ${agents.length} agent definitions.`);
}

async function seedPlans() {
  for (const plan of plans) {
    const record = await prisma.plan.upsert({
      where: { key: plan.key },
      update: {
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        isPublic: true,
        isActive: true,
        sortOrder: plan.sortOrder,
      },
      create: {
        key: plan.key,
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        isPublic: true,
        isActive: true,
        sortOrder: plan.sortOrder,
      },
    });

    for (const [metric, limit] of Object.entries(plan.limits)) {
      await prisma.planLimit.upsert({
        where: { planId_metric: { planId: record.id, metric } },
        update: { limit },
        create: { planId: record.id, metric, limit },
      });
    }

    const validAgentKeys = new Set<string>(plan.agents);
    await prisma.planAgent.deleteMany({
      where: { planId: record.id, agentKey: { notIn: [...validAgentKeys] } },
    });
    for (const agentKey of validAgentKeys) {
      await prisma.planAgent.upsert({
        where: { planId_agentKey: { planId: record.id, agentKey } },
        update: {},
        create: { planId: record.id, agentKey },
      });
    }
  }
  console.log(`Seeded ${plans.length} plans.`);
}

async function seedAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("Skipping bootstrap admin: BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD not set.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.isSuperAdmin) {
      await prisma.user.update({ where: { id: existing.id }, data: { isSuperAdmin: true } });
      console.log(`Promoted existing user ${email} to superadmin.`);
    } else {
      console.log(`Superadmin ${email} already exists; password left unchanged.`);
    }
    await ensureAdminWorkspace(existing.id);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      name: "Platform Admin",
      passwordHash,
      emailVerifiedAt: new Date(),
      isSuperAdmin: true,
    },
  });
  await ensureAdminWorkspace(user.id);
  console.log(`Created bootstrap superadmin ${email}. Change the password after first login.`);
}

async function ensureAdminWorkspace(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId, workspace: { deletedAt: null } },
  });
  if (membership) return;

  const freePlan = await prisma.plan.findUnique({ where: { key: "free" } });
  if (!freePlan) {
    console.log("Skipping admin workspace: free plan missing.");
    return;
  }

  const slugBase = "platform-admin";
  let slug = slugBase;
  let suffix = 1;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${slugBase}-${suffix}`;
    suffix += 1;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: "LeadPilot Platform",
      slug,
      ownerId: userId,
      onboardedAt: new Date(),
      profile: {
        create: {
          companyName: "LeadPilot Platform",
          industry: "SaaS & Software",
          companySize: "1–10",
          regions: "Global",
          targetCustomerTypes: "Internal platform administration",
          valueProposition: "Internal workspace for platform administration and verification.",
        },
      },
      subscription: {
        create: { planId: freePlan.id, status: "ACTIVE", provider: "internal" },
      },
      memberships: { create: { userId, role: "OWNER" } },
    },
  });
  console.log(`Created admin workspace ${workspace.slug}.`);
}

async function main() {
  await seedAgents();
  await seedPlans();
  await seedAdmin();
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
