import { describe, expect, it } from "vitest";

import {
  parseAiOutput,
  qualificationOutputSchema,
  researchOutputSchema,
} from "@/lib/agents/output-schemas";

describe("research output contract", () => {
  it("accepts a grounded summary and applies optional defaults", () => {
    const parsed = researchOutputSchema.safeParse({
      summary: "Regional freight operator focused on cold-chain routes.",
      confidence: "medium",
      insufficientData: false,
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.likelyNeeds).toEqual([]);
    expect(parsed.data.rationale).toBe("");
  });

  it("rejects an empty summary", () => {
    const parsed = researchOutputSchema.safeParse({
      summary: "   ",
      confidence: "low",
      insufficientData: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown confidence value", () => {
    const parsed = researchOutputSchema.safeParse({
      summary: "Summary",
      confidence: "certain",
      insufficientData: false,
    });
    expect(parsed.success).toBe(false);
  });

  it("caps the number of likely needs", () => {
    const parsed = researchOutputSchema.safeParse({
      summary: "Summary",
      confidence: "high",
      insufficientData: false,
      likelyNeeds: ["1", "2", "3", "4", "5", "6"],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("qualification output contract", () => {
  it("accepts a bounded score with reasons", () => {
    const parsed = qualificationOutputSchema.safeParse({
      score: 82,
      suggestedStatus: "QUALIFIED",
      reasons: ["Industry matches", "Size is in range"],
      confidence: "high",
      insufficientData: false,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects scores outside 0-100", () => {
    expect(
      qualificationOutputSchema.safeParse({
        score: 150,
        suggestedStatus: "QUALIFIED",
        reasons: ["Too high"],
        confidence: "high",
        insufficientData: false,
      }).success,
    ).toBe(false);

    expect(
      qualificationOutputSchema.safeParse({
        score: -1,
        suggestedStatus: "DISQUALIFIED",
        reasons: ["Too low"],
        confidence: "low",
        insufficientData: false,
      }).success,
    ).toBe(false);
  });

  it("rejects fractional scores", () => {
    expect(
      qualificationOutputSchema.safeParse({
        score: 82.5,
        suggestedStatus: "QUALIFIED",
        reasons: ["Fractional"],
        confidence: "high",
        insufficientData: false,
      }).success,
    ).toBe(false);
  });

  it("rejects statuses outside the qualification vocabulary", () => {
    expect(
      qualificationOutputSchema.safeParse({
        score: 50,
        suggestedStatus: "CONTACTED",
        reasons: ["Human owned"],
        confidence: "medium",
        insufficientData: false,
      }).success,
    ).toBe(false);
  });

  it("requires at least one reason", () => {
    expect(
      qualificationOutputSchema.safeParse({
        score: 50,
        suggestedStatus: "NURTURE",
        reasons: [],
        confidence: "low",
        insufficientData: true,
      }).success,
    ).toBe(false);
  });
});

describe("parseAiOutput", () => {
  it("returns parsed data when the contract matches", () => {
    const result = parseAiOutput(qualificationOutputSchema, {
      score: 60,
      suggestedStatus: "NURTURE",
      reasons: ["Needs more evidence"],
      confidence: "low",
      insufficientData: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.score).toBe(60);
  });

  it("reports a field-specific error instead of returning partial data", () => {
    const result = parseAiOutput(qualificationOutputSchema, {
      score: 60,
      suggestedStatus: "NURTURE",
      reasons: [],
      confidence: "low",
      insufficientData: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("reasons");
  });
});
