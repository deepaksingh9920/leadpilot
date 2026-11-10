import { describe, expect, it } from "vitest";

import { buildSecurityHeaders } from "./headers";

function headerMap(isProduction: boolean): Map<string, string> {
  return new Map(
    buildSecurityHeaders({ isProduction }).map((header) => [header.key, header.value]),
  );
}

describe("buildSecurityHeaders", () => {
  it("sets a locked-down CSP in production", () => {
    const csp = headerMap(true).get("Content-Security-Policy") ?? "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("allows React and HMR in development without weakening production", () => {
    const development = headerMap(false).get("Content-Security-Policy") ?? "";
    const production = headerMap(true).get("Content-Security-Policy") ?? "";

    expect(development).toContain("'unsafe-eval'");
    expect(development).toContain("ws: wss:");
    expect(development).not.toContain("upgrade-insecure-requests");
    expect(production).not.toContain("'unsafe-eval'");
    expect(production).not.toContain("ws: wss:");
  });

  it("keeps baseline hardening headers on every response", () => {
    const headers = headerMap(true);

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(headers.get("X-DNS-Prefetch-Control")).toBe("off");
    expect(headers.get("X-Permitted-Cross-Domain-Policies")).toBe("none");
  });

  it("only sends HSTS in production", () => {
    expect(headerMap(true).get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(headerMap(false).has("Strict-Transport-Security")).toBe(false);
  });
});
