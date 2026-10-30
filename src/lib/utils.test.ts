import { describe, expect, it } from "vitest";

import {
  formatCompactNumber,
  formatCurrency,
  getInitials,
  parseCommaList,
  parseJsonArray,
  percentage,
  slugify,
} from "./utils";

describe("slugify", () => {
  it("normalizes names into url-safe slugs", () => {
    expect(slugify("Northstar Studio")).toBe("northstar-studio");
    expect(slugify("  Café & Co.  ")).toBe("cafe-co");
    expect(slugify("A___B")).toBe("a-b");
  });

  it("truncates to 48 characters", () => {
    expect(slugify("a".repeat(80))).toHaveLength(48);
  });

  it("returns an empty string when nothing is usable", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("percentage", () => {
  it("caps at 100 and guards against zero limits", () => {
    expect(percentage(0, 50)).toBe(0);
    expect(percentage(25, 50)).toBe(50);
    expect(percentage(75, 50)).toBe(100);
    expect(percentage(5, 0)).toBe(0);
  });
});

describe("formatting helpers", () => {
  it("formats currency without cents when whole", () => {
    expect(formatCurrency(4900)).toBe("$49");
    expect(formatCurrency(14950)).toBe("$149.50");
  });

  it("formats compact numbers", () => {
    expect(formatCompactNumber(1200)).toMatch(/1\.2K/i);
  });

  it("derives initials", () => {
    expect(getInitials("Jordan Ellis")).toBe("JE");
    expect(getInitials("Prince")).toBe("PR");
    expect(getInitials("")).toBe("?");
  });
});

describe("parsing helpers", () => {
  it("parses comma separated lists", () => {
    expect(parseCommaList("US, Canada ,, UK")).toEqual(["US", "Canada", "UK"]);
    expect(parseCommaList(null)).toEqual([]);
  });

  it("parses string arrays and rejects invalid json", () => {
    expect(parseJsonArray('["a","b",3]')).toEqual(["a", "b"]);
    expect(parseJsonArray("not json")).toEqual([]);
    expect(parseJsonArray("{}")).toEqual([]);
  });
});
