import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sqlitePath = `${root}prisma/schema.prisma`;
const postgresPath = `${root}prisma/postgres/schema.prisma`;

function declarations(source: string): string {
  return source.match(/^(model|enum)\s+\w+\s*\{[\s\S]*?^\}/gm)?.join("\n\n") ?? "";
}

const sqlite = readFileSync(sqlitePath, "utf8");
const postgres = readFileSync(postgresPath, "utf8");

describe("Prisma schema parity", () => {
  it("keeps the Postgres models identical to the SQLite models", () => {
    // The application compiles against whichever client was generated last.
    // If only one schema gains a model or field, production and local/test
    // databases silently diverge. Fail here instead.
    expect(declarations(postgres)).toBe(declarations(sqlite));
  });

  it("keeps the local development datasource on SQLite", () => {
    expect(sqlite).toMatch(/datasource\s+db\s*\{[\s\S]*?provider\s*=\s*"sqlite"/);
  });

  it("uses Postgres and a direct migration URL in production", () => {
    expect(postgres).toMatch(/datasource\s+db\s*\{[\s\S]*?provider\s*=\s*"postgresql"/);
    expect(postgres).toMatch(/directUrl\s*=\s*env\("DIRECT_DATABASE_URL"\)/);
  });

  it("targets the Vercel Amazon Linux query engine", () => {
    expect(postgres).toContain("rhel-openssl-3.0.x");
  });
});
