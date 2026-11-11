import { env } from "@/lib/env";
import { isWorkerAuthorized } from "@/lib/security/worker-auth";
import { runRetentionCleanup } from "@/server/services/compliance";
import { runWorker } from "@/server/services/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  if (
    !isWorkerAuthorized(env.workerSecret, {
      authorization: request.headers.get("authorization"),
      workerSecret: request.headers.get("x-worker-secret"),
    })
  ) {
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

    // Retention cleanup runs on the same schedule as the job worker so stale
    // leads are soft-deleted and expired data is purged without a separate cron.
    // A cleanup failure must not hide the job result that was already produced.
    let retention: Awaited<ReturnType<typeof runRetentionCleanup>> | { error: string };
    try {
      retention = await runRetentionCleanup();
    } catch (error) {
      console.error("Retention cleanup failed", error);
      retention = { error: "Retention cleanup failed." };
    }

    return Response.json(
      { ...result, retention },
      { headers: { "Cache-Control": "no-store" } },
    );
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
