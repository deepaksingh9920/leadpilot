/**
 * The only lead data sent to the model. Contact fields are included because
 * they are already stored and the model may cite them; all source and
 * verification context travels with them so the model can stay grounded.
 */
export type GroundedLead = {
  companyName: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  location: string | null;
  employeeCount: number | null;
  revenueBand: string | null;
  description: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  linkedinUrl: string | null;
  sourceUrl: string | null;
  status: string;
  score: number;
  source: { name: string; provider: string; termsUrl: string | null } | null;
  verifications: { field: string; status: string; sourceUrl: string | null; note: string | null }[];
};

export function groundedLeadPayload(lead: GroundedLead) {
  return {
    companyName: lead.companyName,
    domain: lead.domain,
    website: lead.website,
    industry: lead.industry,
    location: lead.location,
    employeeCount: lead.employeeCount,
    revenueBand: lead.revenueBand,
    description: lead.description,
    contactName: lead.contactName,
    contactTitle: lead.contactTitle,
    contactEmail: lead.contactEmail,
    contactPhone: lead.contactPhone,
    linkedinUrl: lead.linkedinUrl,
    sourceUrl: lead.sourceUrl,
    status: lead.status,
    score: lead.score,
    source: lead.source
      ? { name: lead.source.name, provider: lead.source.provider, termsUrl: lead.source.termsUrl }
      : null,
    verifications: lead.verifications,
  };
}
