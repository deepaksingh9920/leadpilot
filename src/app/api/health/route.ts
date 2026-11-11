import { db } from "@/lib/db";
import { collectHealth } from "@/server/services/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unauthenticated readiness probe. It exposes only coarse status values so it is
 * safe for uptime monitors and load balancers.
 */
export async function GET() {
  const report = await collectHealth(db);
  return Response.json(report, {
    status: report.database === "ok" ? 200 : 503,
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-robots-tag": "noindex",
    },
  });
}
