/**
 * Prisma's `mode: "insensitive"` is only available on PostgreSQL. Local
 * development and the test suite use SQLite, where `LIKE` is already
 * case-insensitive for ASCII, and the generated client rejects the extra
 * argument. This helper keeps user-facing search working the same way on both:
 * the flag is sent only when the runtime database is Postgres.
 *
 * It is typed loosely on purpose so the same call site compiles against both
 * generated clients. The returned object is structurally valid for a Prisma
 * string filter on either provider.
 */
export type TextContainsFilter =
  | { contains: string }
  | { contains: string; mode: "insensitive" };

export function isPostgresDatabase(url: string | undefined = process.env.DATABASE_URL): boolean {
  return /^postgres(ql)?:\/\//i.test(url ?? "");
}

export function containsInsensitive(
  value: string,
  options: { postgres?: boolean } = {},
): TextContainsFilter {
  const postgres = options.postgres ?? isPostgresDatabase();
  return postgres ? { contains: value, mode: "insensitive" } : { contains: value };
}
