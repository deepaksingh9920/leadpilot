import { describe, expect, it } from "vitest";

import { CsvParseError, detectDelimiter, parseCsv, serializeCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("parses a simple comma file and keeps source line numbers", () => {
    const parsed = parseCsv("Company,Email\nAcme,hi@acme.test\nBeta,hi@beta.test\n");
    expect(parsed.headers).toEqual(["Company", "Email"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({ values: ["Acme", "hi@acme.test"], line: 2 });
    expect(parsed.rows[1]).toEqual({ values: ["Beta", "hi@beta.test"], line: 3 });
  });

  it("strips a UTF-8 BOM and handles CRLF", () => {
    const parsed = parseCsv("\uFEFFCompany,Email\r\nAcme,hi@acme.test\r\n");
    expect(parsed.headers).toEqual(["Company", "Email"]);
    expect(parsed.rows[0]?.values).toEqual(["Acme", "hi@acme.test"]);
  });

  it("supports quoted fields, escaped quotes, and embedded newlines", () => {
    const parsed = parseCsv(
      'Company,Notes\n"Acme, Inc.","Line one\nLine ""two"""\n',
    );
    expect(parsed.rows[0]?.values).toEqual(["Acme, Inc.", 'Line one\nLine "two"']);
    expect(parsed.rows[0]?.line).toBe(2);
  });

  it("detects semicolon and tab delimiters", () => {
    expect(detectDelimiter("Company;Email;Phone")).toBe(";");
    expect(detectDelimiter("Company\tEmail\tPhone")).toBe("\t");
    const parsed = parseCsv("Company;Email\nAcme;hi@acme.test\n");
    expect(parsed.delimiter).toBe(";");
    expect(parsed.rows[0]?.values).toEqual(["Acme", "hi@acme.test"]);
  });

  it("ignores blank rows", () => {
    const parsed = parseCsv("Company,Email\n\nAcme,hi@acme.test\n\n");
    expect(parsed.rows).toHaveLength(1);
  });

  it("returns an empty result for empty input", () => {
    expect(parseCsv("   ")).toEqual({ headers: [], rows: [], delimiter: "," });
  });

  it("rejects an unterminated quoted field", () => {
    expect(() => parseCsv('Company,Notes\nAcme,"never closed\n')).toThrow(CsvParseError);
  });
});

describe("serializeCsv", () => {
  it("quotes commas, quotes, and newlines and round-trips", () => {
    const headers = ["Company", "Notes"];
    const rows = [["Acme, Inc.", 'Says "hello"\nsecond line'], ["Beta", ""]];
    const csv = serializeCsv(headers, rows);

    expect(csv).toContain('"Acme, Inc."');
    expect(csv).toContain('"Says ""hello""\nsecond line"');

    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(headers);
    expect(parsed.rows.map((row) => row.values)).toEqual(rows);
  });
});
