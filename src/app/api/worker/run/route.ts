import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { runWorker } from "@/server/services/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  if (!env.workerSecret) return false;
  const header =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-worker-secret") ??
    "";
  const expected = Buffer.from(env.workerSecret);
  const provided = Buffer.from(header);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export async function POST(request: Request) {
  if (!env.workerSecret) {
    return Response.json(
      {
        error:
          "Worker is not configured. Set WORKER_SECRET before calling this endpoint.",
      },
      { status: 503 },
    );
  }

  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let limit: number | undefined;
  try {
    const body = await request.json();
    if (body && typeof body === "object" && "limit" in body) {
      const raw = Number((body as { limit?: unknown }).limit);
      if (Number.isInteger(raw) && raw > 0 && raw <= 25) limit = raw;
    }
  } catch {
    // An empty body is valid; the worker uses its default batch size.
  }

  try {
    const result = await runWorker({ limit });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Worker run failed", error);
    return Response.json({ error: "Worker run failed." }, { status: 500 });
  }
}

export function GET() {
  return Response.json(
    { error: "Use POST with a Bearer worker secret to run the queue." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
