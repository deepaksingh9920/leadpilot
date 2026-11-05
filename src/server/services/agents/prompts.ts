import type { AiMessage } from "@/lib/providers/ai";

/**
 * Prompts are deliberately narrow: the model may only reason about records the
 * workspace already stores. It cannot browse, guess contact data, or add
 * sources. Output shape is enforced separately by the zod schemas.
 */

const RESEARCH_SYSTEM = `You are a B2B research analyst working inside LeadPilot.
Use only the facts in the supplied workspace record. Do not browse the web.
Never invent or infer email addresses, phone numbers, people, URLs, revenue, funding, or sources.
If the record is too thin to support a useful summary, set insufficientData to true and keep the summary cautious.
Return exactly one JSON object with these keys:
- summary: string (max 1500 characters)
- likelyNeeds: array of up to 5 short strings
- confidence: "low" | "medium" | "high"
- insufficientData: boolean
- rationale: string (max 600 characters) explaining what evidence supported the summary
Do not include markdown, code fences, or commentary outside the JSON object.`;

const QUALIFICATION_SYSTEM = `You are a lead qualification analyst working inside LeadPilot.
Score fit from 0 to 100 using only the supplied workspace record.
Choose suggestedStatus from "QUALIFIED", "NURTURE", or "DISQUALIFIED".
Every reason must refer to a field or source present in the input; do not invent facts or contact details.
If the record lacks enough evidence, set insufficientData to true, suggestedStatus to "NURTURE", confidence to "low", and explain why.
Return exactly one JSON object with these keys:
- score: integer 0-100
- suggestedStatus: "QUALIFIED" | "NURTURE" | "DISQUALIFIED"
- reasons: array of 1-6 short strings
- confidence: "low" | "medium" | "high"
- insufficientData: boolean
Do not include markdown, code fences, or commentary outside the JSON object.`;

export function researchMessages(payload: unknown): AiMessage[] {
  return [
    { role: "system", content: RESEARCH_SYSTEM },
    {
      role: "user",
      content: `Workspace record (JSON):\n${JSON.stringify(payload, null, 2)}`,
    },
  ];
}

export function qualificationMessages(payload: unknown): AiMessage[] {
  return [
    { role: "system", content: QUALIFICATION_SYSTEM },
    {
      role: "user",
      content: `Lead record (JSON):\n${JSON.stringify(payload, null, 2)}`,
    },
  ];
}
