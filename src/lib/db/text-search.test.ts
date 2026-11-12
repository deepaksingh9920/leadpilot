import { describe, expect, it } from "vitest";

import { containsInsensitive, isPostgresDatabase } from "@/lib/db/text-search";

describe("isPostgresDatabase", () => {
  it("recognizes pooled and direct Postgres URLs", () => {
    expect(isPostgresDatabase("postgresql://user:pass@host/db")).toBe(true);
    expect(isPostgresDatabase("postgres://user:pass@host/db")).toBe(true);
    expect(isPostgresDatabase("POSTGRESQL://user:pass@host/db")).toBe(true);
  });

  it("rejects SQLite and missing URLs", () => {
    expect(isPostgresDatabase("file:./dev.db")).toBe(false);
    expect(isPostgresDatabase(undefined)).toBe(false);
    expect(isPostgresDatabase("")).toBe(false);
  });
});

describe("containsInsensitive", () => {
  it("adds the Postgres-only mode flag when the runtime is Postgres", () => {
    expect(containsInsensitive("Acme", { postgres: true })).toEqual({
      contains: "Acme",
      mode: "insensitive",
    });
  });

  it("omits the flag for SQLite, where LIKE is already case-insensitive", () => {
    expect(containsInsensitive("Acme", { postgres: false })).toEqual({
      contains: "Acme",
    });
  });
});
