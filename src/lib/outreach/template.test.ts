import { describe, expect, it } from "vitest";

import {
  buildTemplateDraft,
  outreachApprovalHash,
  outreachContent,
  validateOutreachContent,
} from "@/lib/outreach/template";

describe("grounded outreach template", () => {
  it("uses only the lead and workspace facts it is given", () => {
    const draft = buildTemplateDraft(
      {
        companyName: "Acme Logistics",
        contactName: "Dana",
        industry: "Logistics",
        location: "Austin, TX",
      },
      {
        companyName: "Sender Co",
        senderName: "Alex",
        valueProposition: "We reduce dispatch delays for regional carriers.",
      },
    );

    expect(draft.subject).toBe("A quick question for Acme Logistics");
    expect(draft.body).toContain("Hi Dana,");
    expect(draft.body).toContain("I'm Alex at Sender Co.");
    expect(draft.body).toContain("We reduce dispatch delays for regional carriers.");
    expect(draft.body).toContain("Acme Logistics works in Logistics and is based in Austin, TX.");
    expect(draft.body).toContain("Best,\nAlex");
  });

  it("omits facts that are not stored instead of inventing them", () => {
    const draft = buildTemplateDraft(
      { companyName: "Beta", contactName: null, industry: null, location: null },
      { companyName: "Sender Co", senderName: null, valueProposition: null },
    );

    expect(draft.body.startsWith("Hello,")).toBe(true);
    expect(draft.body).toContain("I'm Sender Co at Sender Co.");
    expect(draft.body).not.toContain("I noticed");
    expect(draft.body).not.toContain("Hi null");
  });

  it("validates subject and body limits", () => {
    expect(validateOutreachContent("Hi", "Short")).toEqual([
      "Add a subject of at least 3 characters.",
      "Write at least a couple of sentences before saving the draft.",
    ]);
    expect(validateOutreachContent("Hello there", "A".repeat(5001))).toEqual([
      "Keep the message under 5000 characters.",
    ]);
    expect(validateOutreachContent("Hello there", "A real message with enough detail.")).toEqual(
      [],
    );
  });

  it("hashes the exact approved content and changes when either field changes", () => {
    const first = outreachApprovalHash("Subject", "Body");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(outreachApprovalHash("Subject", "Body")).toBe(first);
    expect(outreachApprovalHash("Subject", "Body.")).not.toBe(first);
    expect(outreachApprovalHash("Subject!", "Body")).not.toBe(first);
    expect(outreachContent(" Subject ", " Body ")).toBe("Subject: Subject\n\nBody");
  });
});
