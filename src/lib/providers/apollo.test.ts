import { describe, expect, it } from "vitest";

import { apolloSizeRange, searchApolloLeads } from "@/lib/providers/apollo";
import type { FetchLike } from "@/lib/providers/http";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function captureFetch(body: unknown): {
  fetchImpl: FetchLike;
  calls: { url: string; init: RequestInit | undefined }[];
} {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ url: String(input), init });
    return json(body);
  };
  return { fetchImpl, calls };
}

const FIXED = new Date("2026-11-01T12:00:00.000Z");

describe("Apollo adapter", () => {
  it("shapes the search request from the ICP query", async () => {
    const { fetchImpl, calls } = captureFetch({ people: [] });

    await searchApolloLeads(
      {
        industry: "SaaS",
        region: "United States",
        companySize: "51-200",
        targetCustomerType: "CTO, VP Engineering",
        limit: 10,
      },
      {
        apiKey: "secret-apollo-key",
        baseUrl: "https://apollo.test/v1/",
        fetchImpl,
        now: () => FIXED,
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://apollo.test/v1/mixed_people/api_search");
    expect(calls[0].init?.headers).toMatchObject({
      "x-api-key": "secret-apollo-key",
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      page: 1,
      per_page: 10,
      q_organization_keyword_tags: ["SaaS"],
      person_locations: ["United States"],
      organization_num_employees_ranges: ["51,200"],
      person_titles: ["CTO", "VP Engineering"],
    });
  });

  it("normalizes every supplied field without inventing contact data", async () => {
    const { fetchImpl } = captureFetch({
      people: [
        {
          id: "apollo-person-1",
          name: "Ada Lovelace",
          title: "CTO",
          email: " Ada@Analytical.Example ",
          linkedin_url: "https://www.linkedin.com/in/ada",
          phone_numbers: [{ sanitized_number: "+1-555-0100" }],
          organization: {
            name: "Analytical Engines",
            primary_domain: "analytical.example",
            website_url: "https://analytical.example",
            industry: "SaaS",
            city: "London",
            country: "UK",
            estimated_num_employees: "120",
            short_description: "Builds analytical engines.",
            keywords: ["analytics", "analytics", "b2b"],
          },
        },
        {
          id: "apollo-person-2",
          organization: { name: "No Contact Co" },
        },
      ],
    });

    const result = await searchApolloLeads(
      { industry: "SaaS", region: "UK", limit: 5 },
      { apiKey: "key", fetchImpl, now: () => FIXED },
    );

    expect(result.records).toHaveLength(2);
    expect(result.skipped).toBe(0);
    const [lead] = result.records;
    expect(lead).toMatchObject({
      provider: "apollo",
      companyName: "Analytical Engines",
      domain: "analytical.example",
      website: "https://analytical.example/",
      industry: "SaaS",
      location: "London, UK",
      employeeCount: 120,
      description: "Builds analytical engines.",
      contactName: "Ada Lovelace",
      contactTitle: "CTO",
      contactEmail: "ada@analytical.example",
      contactPhone: "+1-555-0100",
      linkedinUrl: "https://www.linkedin.com/in/ada",
      sourceRecordId: "apollo-person-1",
      sourceUrl: "https://www.linkedin.com/in/ada",
      dedupeKey: "email:ada@analytical.example",
      tags: ["analytics", "b2b"],
    });
    expect(lead.retrievedAt).toEqual(FIXED);

    const noContact = result.records[1];
    expect(noContact.companyName).toBe("No Contact Co");
    expect(noContact.contactEmail).toBeNull();
    expect(noContact.contactPhone).toBeNull();
  });

  it("skips malformed and unattributable rows with a note", async () => {
    const { fetchImpl } = captureFetch({
      people: [
        null,
        {},
        { id: "has-id-only", organization: {} },
        { organization: { name: "No ID Co" } },
        { id: "valid-1", organization: { name: "Valid Co" } },
      ],
    });

    const result = await searchApolloLeads(
      { industry: "SaaS", region: "US", limit: 5 },
      { apiKey: "key", fetchImpl },
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0].companyName).toBe("Valid Co");
    expect(result.skipped).toBe(4);
    expect(result.notes[0]).toContain("4 Apollo record(s)");
  });

  it("rejects an unexpected payload shape", async () => {
    const { fetchImpl } = captureFetch({ error: "nope" });

    await expect(
      searchApolloLeads(
        { industry: "SaaS", region: "US", limit: 5 },
        { apiKey: "key", fetchImpl },
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE", retryable: false });
  });

  it("refuses to call Apollo without a key", async () => {
    await expect(
      searchApolloLeads(
        { industry: "SaaS", region: "US", limit: 5 },
        { apiKey: "", fetchImpl: async () => json({ people: [] }) },
      ),
    ).rejects.toMatchObject({ code: "CONFIGURATION", retryable: false });
  });

  it("converts common company-size labels to Apollo range syntax", () => {
    expect(apolloSizeRange("51-200")).toBe("51,200");
    expect(apolloSizeRange("201–500")).toBe("201,500");
    expect(apolloSizeRange("1,000+")).toBe("1000,1000000");
    expect(apolloSizeRange("5000+")).toBe("5000,1000000");
    expect(apolloSizeRange("100")).toBeNull();
    expect(apolloSizeRange("small")).toBeNull();
    expect(apolloSizeRange(null)).toBeNull();
  });
});
