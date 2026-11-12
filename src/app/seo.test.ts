import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

function disallowedPaths(): string[] {
  const rules = robots().rules;
  const list = Array.isArray(rules) ? rules : [rules];
  return list.flatMap((rule) => {
    const disallow = rule.disallow;
    if (!disallow) return [];
    return Array.isArray(disallow) ? disallow : [disallow];
  });
}

describe("search engine directives", () => {
  it("keeps authenticated and token-bearing areas out of the index", () => {
    expect(disallowedPaths()).toEqual(
      expect.arrayContaining([
        "/api/",
        "/admin",
        "/dashboard",
        "/leads",
        "/settings",
        "/invite/",
        "/unsubscribe/",
      ]),
    );
  });

  it("points crawlers at the generated sitemap", () => {
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("lists only the public marketing pages", () => {
    const paths = sitemap()
      .map((entry) => new URL(entry.url).pathname)
      .sort();
    expect(paths).toEqual(["/", "/features", "/pricing"]);
  });
});
