import { z } from "zod";

/**
 * Output contracts for grounded AI agents. A response that does not match its
 * schema is rejected; the model is never allowed to widen its own permissions.
 */

export const confidenceSchema = z.enum(["low", "medium", "high"]);

export const researchOutputSchema = z.object({
  summary: z.string().trim().min(1).max(1500),
  likelyNeeds: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
  confidence: confidenceSchema,
  insufficientData: z.boolean(),
  rationale: z.string().trim().max(600).default(""),
});

export type ResearchOutput = z.infer<typeof researchOutputSchema>;

export const qualificationStatusSchema = z.enum(["QUALIFIED", "NURTURE", "DISQUALIFIED"]);

export const qualificationOutputSchema = z.object({
  score: z.number().int().min(0).max(100),
  suggestedStatus: qualificationStatusSchema,
  reasons: z.array(z.string().trim().min(1).max(240)).min(1).max(6),
  confidence: confidenceSchema,
  insufficientData: z.boolean(),
});

export type QualificationOutput = z.infer<typeof qualificationOutputSchema>;

export type ParsedOutput<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function parseAiOutput<T>(schema: z.ZodType<T>, value: unknown): ParsedOutput<T> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: result.error.issues
      .map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`)
      .join("; ")
      .slice(0, 500),
  };
}
