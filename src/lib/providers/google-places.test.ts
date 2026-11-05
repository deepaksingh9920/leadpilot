import { describe, expect, it } from "vitest";

import { searchGooglePlacesLeads } from "@/lib/providers/google-places";
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

describe("Google Places adapter", () => {
  it("shapes a text search request with a field mask", async () => {
    const { fetchImpl, calls } = captureFetch({ places: [] });

    await searchGooglePlacesLeads(
      { industry: "plumber", region: "Austin, TX", limit: 50 },
      {
        apiKey: "places-secret",
        baseUrl: "https://places.test/v1/",
        fetchImpl,
        now: () => FIXED,
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://places.test/v1/places:searchText");
    expect(calls[0].init?.headers).toMatchObject({
      "X-Goog-Api-Key": "places-secret",
    });
    const fieldMask = String(
      (calls[0].init?.headers as Record<string, string>)["X-Goog-FieldMask"],
    );
    expect(fieldMask).toContain("places.id");
    expect(fieldMask).toContain("places.businessStatus");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      textQuery: "plumber in Austin, TX",
      maxResultCount: 20,
    });
  });

  it("maps business listings without inventing an email address", async () => {
    const { fetchImpl } = captureFetch({
      places: [
        {
          id: "place-1",
          displayName: { text: "Bob's Plumbing" },
          formattedAddress: "1 Main St, Austin, TX",
          websiteUri: "bobsplumbing.example",
          nationalPhoneNumber: "+1 512-555-0100",
          primaryTypeDisplayName: { text: "Plumber" },
          types: ["plumber", "service"],
          businessStatus: "OPERATIONAL",
          googleMapsUri: "https://maps.google.com/?cid=1",
        },
        {
          id: "place-2",
          displayName: { text: "Type Only Co" },
          types: ["electrician"],
          websiteUri: "typeonly.example",
        },
      ],
    });

    const result = await searchGooglePlacesLeads(
      { industry: "plumber", region: "Austin, TX", limit: 10 },
      { apiKey: "key", fetchImpl, now: () => FIXED },
    );

    expect(result.records).toHaveLength(2);
    expect(result.skipped).toBe(0);
    const [lead] = result.records;
    expect(lead).toMatchObject({
      provider: "google_places",
      companyName: "Bob's Plumbing",
      domain: "bobsplumbing.example",
      website: "https://bobsplumbing.example/",
      industry: "Plumber",
      location: "1 Main St, Austin, TX",
      employeeCount: null,
      description: null,
      contactName: null,
      contactEmail: null,
      contactPhone: "+1 512-555-0100",
      linkedinUrl: null,
      sourceRecordId: "place-1",
      sourceUrl: "https://maps.google.com/?cid=1",
      dedupeKey: "domain:bobsplumbing.example",
      tags: ["plumber", "service"],
    });
    expect(lead.retrievedAt).toEqual(FIXED);

    expect(result.records[1].industry).toBe("electrician");
    expect(result.records[1].contactEmail).toBeNull();
    expect(result.records[1].sourceUrl).toBe("https://typeonly.example/");
  });

  it("skips closed listings and records without an id or name", async () => {
    const { fetchImpl } = captureFetch({
      places: [
        null,
        { id: "no-name" },
        { displayName: { text: "No Id" } },
        {
          id: "closed-perm",
          displayName: { text: "Closed Co" },
          businessStatus: "CLOSED_PERMANENTLY",
        },
        {
          id: "closed-temp",
          displayName: { text: "Paused Co" },
          businessStatus: "CLOSED_TEMPORARILY",
        },
        {
          id: "open",
          displayName: { text: "Open Co" },
          businessStatus: "OPERATIONAL",
        },
      ],
    });

    const result = await searchGooglePlacesLeads(
      { industry: "cafe", region: "Austin", limit: 10 },
      { apiKey: "key", fetchImpl },
    );

    expect(result.records.map((record) => record.companyName)).toEqual(["Open Co"]);
    expect(result.skipped).toBe(5);
    expect(result.notes.join(" ")).toContain("2 permanently or temporarily closed");
    expect(result.notes.join(" ")).toContain("3 Places record(s)");
  });

  it("rejects an unexpected payload shape", async () => {
    const { fetchImpl } = captureFetch({ results: [] });

    await expect(
      searchGooglePlacesLeads(
        { industry: "cafe", region: "Austin", limit: 5 },
        { apiKey: "key", fetchImpl },
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE", retryable: false });
  });

  it("refuses to call Places without a key", async () => {
    await expect(
      searchGooglePlacesLeads(
        { industry: "cafe", region: "Austin", limit: 5 },
        { apiKey: "", fetchImpl: async () => json({ places: [] }) },
      ),
    ).rejects.toMatchObject({ code: "CONFIGURATION", retryable: false });
  });
});
