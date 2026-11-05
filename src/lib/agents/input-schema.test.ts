import { describe, expect, it } from "vitest";

import {
  parseAgentInputSchema,
  validateAgentInput,
  type AgentInputSchema,
} from "@/lib/agents/input-schema";

const schema: AgentInputSchema = {
  properties: [
    { name: "industry", type: "string", required: true },
    { name: "region", type: "string", required: false },
    {
      name: "limit",
      type: "integer",
      required: false,
      minimum: 1,
      maximum: 100,
    },
    { name: "leadIds", type: "array", required: true },
    { name: "tone", type: "string", required: false, enum: ["direct", "warm"] },
  ],
  required: ["industry", "leadIds"],
};

describe("parseAgentInputSchema", () => {
  it("parses the subset used by seeded agents", () => {
    const parsed = parseAgentInputSchema(
      JSON.stringify({
        type: "object",
        properties: {
          industry: { type: "string", description: "Sector" },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          leadIds: { type: "array", items: { type: "string" } },
        },
        required: ["industry"],
      }),
    );

    expect(parsed.parseError).toBeUndefined();
    expect(parsed.properties).toHaveLength(3);
    expect(parsed.properties[0]).toMatchObject({
      name: "industry",
      type: "string",
      required: true,
      description: "Sector",
    });
    expect(parsed.properties[1]).toMatchObject({ type: "integer", minimum: 1, maximum: 100 });
    expect(parsed.properties[2]).toMatchObject({ type: "array", required: false });
  });

  it("treats an empty schema as no input", () => {
    expect(parseAgentInputSchema("{}")).toEqual({ properties: [], required: [] });
    expect(parseAgentInputSchema(null)).toEqual({ properties: [], required: [] });
  });

  it("reports malformed schemas instead of guessing", () => {
    expect(parseAgentInputSchema("{not json").parseError).toContain("not valid JSON");
    expect(parseAgentInputSchema('{"type":"object"}').parseError).toContain("no properties");
  });
});

describe("validateAgentInput", () => {
  it("accepts valid input, trims arrays, and removes duplicates", () => {
    const result = validateAgentInput(schema, {
      industry: "SaaS",
      limit: "25",
      leadIds: "lead_1, lead_2,lead_1",
      tone: "warm",
    });

    expect(result).toEqual({
      ok: true,
      value: { industry: "SaaS", limit: 25, leadIds: ["lead_1", "lead_2"], tone: "warm" },
    });
  });

  it("reports missing required fields", () => {
    const result = validateAgentInput(schema, {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.industry).toHaveLength(1);
    expect(result.errors.leadIds).toHaveLength(1);
    expect(result.errors.region).toBeUndefined();
  });

  it("enforces integer bounds and enums", () => {
    const low = validateAgentInput(schema, { industry: "SaaS", leadIds: "1", limit: "0" });
    expect(low.ok).toBe(false);
    if (low.ok) return;
    expect(low.errors.limit?.[0]).toContain("at least 1");

    const high = validateAgentInput(schema, { industry: "SaaS", leadIds: "1", limit: "101" });
    expect(high.ok).toBe(false);
    if (high.ok) return;
    expect(high.errors.limit?.[0]).toContain("at most 100");

    const wrongEnum = validateAgentInput(schema, {
      industry: "SaaS",
      leadIds: "1",
      tone: "shouty",
    });
    expect(wrongEnum.ok).toBe(false);
    if (wrongEnum.ok) return;
    expect(wrongEnum.errors.tone?.[0]).toContain("Choose one of");
  });

  it("rejects non-integer numbers", () => {
    const result = validateAgentInput(schema, { industry: "SaaS", leadIds: "1", limit: "2.5" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.limit?.[0]).toContain("whole number");
  });
});
