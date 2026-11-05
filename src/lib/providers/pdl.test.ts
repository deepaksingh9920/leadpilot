import { describe, expect, it } from "vitest";

import type { FetchLike } from "@/lib/providers/http";
import { searchPdlLeads } from "@/lib/providers/pdl";

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

describe("People Data Labs adapter", () => {
  it("shapes a company search request and clamps the page size", async () => {
    const { fetchImpl, calls } = captureFetch({ data: [] });

    await searchPdlLeads(
      {
        industry: "SaaS",
        region: "US",
        companySize: "51-200",
        limit: 500,
      },
      {
        apiKey: "pdl-secret",
        baseUrl: "https://pdl.test/v5/",
        fetchImpl,
        now: () => FIXED,
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://pdl.test/v5/company/search");
    expect(calls[0].init?.headers).toMatchObject({ "X-Api-Key": "pdl-secret" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      query: {
        bool: {
          must: [
            { match: { industry: "SaaS" } },
            { match: { "location.country": "US" } },
            { term: { size: "51-200" } },
          ],
        },
      },
      size: 100,
    });
  });

  it("omits the size filter when no company size is supplied", async () => {
    const { fetchImpl, calls } = captureFetch({ data: [] });

    await searchPdlLeads(
      { industry: "Fintech", region: "GB", limit: 5 },
      { apiKey: "key", fetchImpl },
    );

    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.query.bool.must).toHaveLength(2);
    expect(body.size).toBe(5);
  });

  it("normalizes company records and never copies a contact address", async () => {
    const { fetchImpl } = captureFetch({
      data: [
        {
          id: "pdl-company-1",
          name: "Acme Logistics",
          website: "https://www.acme.example/about",
          industry: "Logistics",
          location: { name: "Austin, TX" },
          employee_count: 50,
          summary: "Regional freight operator.",
          linkedin_url: "https://www.linkedin.com/company/acme",
          tags: ["freight", "freight", "regional"],
          email: "should-not-copy@acme.example",
        },
        {
          id: "pdl-company-2",
          name: "Beta Foods",
          website: "beta.example",
          location: { locality: "Denver", region: "CO", country: "US" },
        },
      ],
    });

    const result = await searchPdlLeads(
      { industry: "Logistics", region: "US", limit: 10 },
      { apiKey: "key", fetchImpl, now: () => FIXED },
    );

    expect(result.records).toHaveLength(2);
    expect(result.skipped).toBe(0);
    const [lead] = result.records;
    expect(lead).toMatchObject({
      provider: "pdl",
      companyName: "Acme Logistics",
      domain: "acme.example",
      website: "https://www.acme.example/about",
      industry: "Logistics",
      location: "Austin, TX",
      employeeCount: 50,
      description: "Regional freight operator.",
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      linkedinUrl: "https://www.linkedin.com/company/acme",
      sourceRecordId: "pdl-company-1",
      sourceUrl: "https://www.linkedin.com/company/acme",
      dedupeKey: "domain:acme.example",
      tags: ["freight", "regional"],
    });
    expect(lead.retrievedAt).toEqual(FIXED);
    expect(result.records[1].location).toBe("Denver, CO, US");
    expect(result.records[1].contactEmail).toBeNull();
  });

  it("skips rows without a company name or record id", async () => {
    const { fetchImpl } = captureFetch({
      data: [
        null,
        { id: "only-id" },
        { name: "Only Name" },
        { id: "valid", name: "Valid Co" },
      ],
    });

    const result = await searchPdlLeads(
      { industry: "SaaS", region: "US", limit: 5 },
      { apiKey: "key", fetchImpl },
    );

    expect(result.records.map((record) => record.companyName)).toEqual(["Valid Co"]);
    expect(result.skipped).toBe(3);
    expect(result.notes[0]).toContain("3 PDL record(s)");
  });

  it("rejects an unexpected payload shape", async () => {
    const { fetchImpl } = captureFetch({ results: [] });

    await expect(
      searchPdlLeads(
        { industry: "SaaS", region: "US", limit: 5 },
        { apiKey: "key", fetchImpl },
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE", retryable: false });
  });

  it("refuses to call PDL without a key", async () => {
    await expect(
      searchPdlLeads(
        { industry: "SaaS", region: "US", limit: 5 },
        { apiKey: "", fetchImpl: async () => json({ data: [] }) },
      ),
    ).rejects.toMatchObject({ code: "CONFIGURATION", retryable: false });
  });
});
