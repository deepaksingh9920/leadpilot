import { sha256 } from "@/lib/security/hash";

/**
 * Deterministic outreach draft built only from stored workspace and lead fields.
 *
 * This is a starting point for a human editor, not an autonomous sender. Missing
 * facts are omitted rather than guessed, and the platform always appends the
 * unsubscribe footer at send time.
 */

export type OutreachTemplateLead = {
  companyName: string;
  contactName?: string | null;
  industry?: string | null;
  location?: string | null;
};

export type OutreachTemplateProfile = {
  companyName: string;
  valueProposition?: string | null;
  senderName?: string | null;
};

export function buildTemplateDraft(
  lead: OutreachTemplateLead,
  profile: OutreachTemplateProfile,
): { subject: string; body: string } {
  const subject = `A quick question for ${lead.companyName}`.slice(0, 160);
  const greeting = lead.contactName ? `Hi ${lead.contactName},` : "Hello,";
  const sender = profile.senderName?.trim() || profile.companyName;
  const offer =
    profile.valueProposition?.trim() ||
    `${profile.companyName} may be able to help ${lead.companyName} with the work you do.`;

  const context = [
    lead.industry ? `${lead.companyName} works in ${lead.industry}` : null,
    lead.location ? `and is based in ${lead.location}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  const body = [
    greeting,
    `I'm ${sender} at ${profile.companyName}.`,
    offer,
    context ? `I noticed ${context}.` : null,
    "Would you be open to a short conversation to see whether this is relevant?",
    "If not, no problem — tell me and I will not follow up.",
    `Best,\n${sender}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  return { subject, body };
}

export const OUTREACH_LIMITS = {
  subjectMin: 3,
  subjectMax: 160,
  bodyMin: 20,
  bodyMax: 5000,
} as const;

export function validateOutreachContent(subject: string, body: string): string[] {
  const errors: string[] = [];
  const cleanSubject = subject.trim();
  const cleanBody = body.trim();

  if (cleanSubject.length < OUTREACH_LIMITS.subjectMin) {
    errors.push("Add a subject of at least 3 characters.");
  }
  if (cleanSubject.length > OUTREACH_LIMITS.subjectMax) {
    errors.push(`Keep the subject under ${OUTREACH_LIMITS.subjectMax} characters.`);
  }
  if (cleanBody.length < OUTREACH_LIMITS.bodyMin) {
    errors.push("Write at least a couple of sentences before saving the draft.");
  }
  if (cleanBody.length > OUTREACH_LIMITS.bodyMax) {
    errors.push(`Keep the message under ${OUTREACH_LIMITS.bodyMax} characters.`);
  }

  return errors;
}

/** The canonical content that an approval covers. */
export function outreachContent(subject: string, body: string): string {
  return `Subject: ${subject.trim()}\n\n${body.trim()}`;
}

/**
 * Hash stored at approval time. The sender recomputes it immediately before
 * delivery, so an edited draft can never be sent under an earlier approval.
 */
export function outreachApprovalHash(subject: string, body: string): string {
  return sha256(outreachContent(subject, body));
}
