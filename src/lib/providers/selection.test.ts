import { describe, expect, it } from "vitest";

import { keyName, selectLeadSource } from "@/lib/providers/selection";

describe("lead source selection", () => {
  it("uses an explicitly named provider and its terms URL", () => {
    const result = selectLeadSource({
      primary: "apollo",
      apolloKey: "apollo-key",
    });

    expect(result).toMatchObject({
      ok: true,
      source: {
        provider: "apollo",
        label: "Apollo",
        apiKey: "apollo-key",
        termsUrl: "https://www.apollo.io/terms",
      },
    });
  });

  it("normalizes case and surrounding whitespace", () => {
    const result = selectLeadSource({
      primary: "  PDL ",
      pdlKey: "  pdl-key  ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.provider).toBe("pdl");
    expect(result.source.apiKey).toBe("pdl-key");
  });

  it("falls back to the single configured provider when no primary is set", () => {
    const result = selectLeadSource({ googlePlacesKey: "places-key" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.provider).toBe("google_places");
  });

  it("refuses to guess between multiple configured keys", () => {
    const result = selectLeadSource({
      apolloKey: "apollo-key",
      pdlKey: "pdl-key",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("AMBIGUOUS");
    expect(result.message).toContain("PRIMARY_LEAD_SOURCE");
  });

  it("treats csv as an explicit request that cannot resolve multiple keys", () => {
    const result = selectLeadSource({
      primary: "csv",
      apolloKey: "apollo-key",
      pdlKey: "pdl-key",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("AMBIGUOUS");
  });

  it("fails honestly when the named provider has no key", () => {
    const result = selectLeadSource({
      primary: "apollo",
      pdlKey: "pdl-key",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("MISSING_KEY");
    expect(result.message).toContain("APOLLO_API_KEY");
  });

  it("rejects an unsupported provider name instead of falling back", () => {
    const result = selectLeadSource({
      primary: "bing",
      apolloKey: "apollo-key",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("INVALID");
    expect(result.message).toContain("bing");
  });

  it("reports NONE when nothing is configured", () => {
    const result = selectLeadSource({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("NONE");
    expect(result.message).toContain("CSV");
  });

  it("prefers the explicit provider over other available keys", () => {
    const result = selectLeadSource({
      primary: "pdl",
      apolloKey: "apollo-key",
      pdlKey: "pdl-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.provider).toBe("pdl");
  });

  it("honors an operator-provided terms URL override", () => {
    const result = selectLeadSource({
      primary: "google_places",
      googlePlacesKey: "places-key",
      googlePlacesTermsUrl: "https://example.test/terms",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.termsUrl).toBe("https://example.test/terms");
  });

  it("maps each provider to its environment key name", () => {
    expect(keyName("apollo")).toBe("APOLLO_API_KEY");
    expect(keyName("pdl")).toBe("PDL_API_KEY");
    expect(keyName("google_places")).toBe("GOOGLE_PLACES_API_KEY");
  });
});
