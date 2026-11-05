import { describe, expect, it } from "vitest";

import {
  autoDetectMapping,
  buildDedupeKey,
  mappingFromFormValues,
  mappingIsUsable,
  normalizeDomain,
  normalizeEmail,
  prepareImport,
  validateRow,
} from "@/lib/leads/import";

describe("header mapping", () => {
  it("auto-detects common headers", () => {
    const mapping = autoDetectMapping([
      "Company Name",
      "Website",
      "Contact Email",
      "Employees",
      "Evidence URL",
    ]);
    expect(mapping.companyName).toBe(0);
    expect(mapping.website).toBe(1);
    expect(mapping.contactEmail).toBe(2);
    expect(mapping.employeeCount).toBe(3);
    expect(mapping.sourceUrl).toBe(4);
  });

  it("does not map the same column to two fields", () => {
    const mapping = autoDetectMapping(["Company", "Email"]);
    expect(mapping.companyName).toBe(0);
    expect(mapping.contactEmail).toBe(1);
    expect(mapping.domain).toBeUndefined();
  });

  it("reads mapping from form values and requires company name", () => {
    const mapping = mappingFromFormValues({ map_companyName: "0", map_contactEmail: "2" });
    expect(mapping).toEqual({ companyName: 0, contactEmail: 2 });
    expect(mappingIsUsable(mapping)).toBe(true);
    expect(mappingIsUsable({ contactEmail: 2 })).toBe(false);
  });
});

describe("normalization", () => {
  it("normalizes emails and domains", () => {
    expect(normalizeEmail("  Hello@Acme.TEST ")).toBe("hello@acme.test");
    expect(normalizeDomain("https://www.Acme.test/path?q=1")).toBe("acme.test");
    expect(normalizeDomain("acme")).toBeNull();
  });

  it("prefers email, then domain, then company and location", () => {
    expect(
      buildDedupeKey({
        contactEmail: "Hi@Acme.test",
        domain: "acme.test",
        companyName: "Acme",
        location: "Austin",
      }),
    ).toBe("email:hi@acme.test");

    expect(
      buildDedupeKey({ domain: "https://www.acme.test", companyName: "Acme" }),
    ).toBe("domain:acme.test");

    expect(
      buildDedupeKey({ companyName: "Acme, Inc.", location: "Austin, TX" }),
    ).toBe("company:acme inc|austin tx");
  });
});

describe("validateRow", () => {
  const mapping = {
    companyName: 0,
    contactEmail: 1,
    employeeCount: 2,
    website: 3,
    tags: 4,
  };

  it("accepts a valid row and normalizes values", () => {
    const result = validateRow(
      ["Acme", "Hi@Acme.Test", "250 employees", "acme.test", "saas, mid-market"],
      mapping,
      4,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.companyName).toBe("Acme");
    expect(result.row.contactEmail).toBe("hi@acme.test");
    expect(result.row.employeeCount).toBe(250);
    expect(result.row.website).toBe("https://acme.test/");
    expect(result.row.domain).toBe("acme.test");
    expect(result.row.tags).toEqual(["saas", "mid-market"]);
    expect(result.row.line).toBe(4);
    expect(result.row.dedupeKey).toBe("email:hi@acme.test");
  });

  it("rejects a missing company name and invalid email", () => {
    const result = validateRow(["", "not-an-email", "", "", ""], mapping, 2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Company name is required.");
    expect(result.errors).toContain("Contact email is not a valid address.");
  });

  it("rejects invalid URLs and employee counts", () => {
    const result = validateRow(["Acme", "", "many", "javascript:alert(1)", ""], mapping, 2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Website must be an http(s) URL.");
    expect(result.errors).toContain("Employee count must be a whole number.");
  });
});

describe("prepareImport", () => {
  const mapping = { companyName: 0, contactEmail: 1 };

  it("splits valid, invalid, and in-file duplicate rows", () => {
    const prepared = prepareImport(
      [
        { values: ["Acme", "hi@acme.test"], line: 2 },
        { values: ["Acme duplicate", "HI@acme.test"], line: 3 },
        { values: ["", "missing@name.test"], line: 4 },
        { values: ["Beta", "hi@beta.test"], line: 5 },
      ],
      mapping,
    );

    expect(prepared.rows.map((row) => row.companyName)).toEqual(["Acme", "Beta"]);
    expect(prepared.issues).toHaveLength(1);
    expect(prepared.issues[0]?.line).toBe(4);
    expect(prepared.duplicateLines).toEqual([3]);
  });
});
