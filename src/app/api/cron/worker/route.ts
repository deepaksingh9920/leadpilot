import { env } from "@/lib/env";
import { isWorkerAuthorized } from "@/lib/security/worker-auth";
import { runWorkerTick } from "@/server/services/worker-tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron target. Vercel issues a GET with `Authorization: Bearer
 * $CRON_SECRET`; nothing else should be able to drain the queue. The POST
 * endpoint remains available for manual or external schedulers using
 * WORKER_SECRET.
 */
export async function GET(request: Request) {
  if (!env.cronSecret) {
    return Response.json(
      {
        error:
          "Scheduler is not configured. Set CRON_SECRET before calling this endpoint.",
      },
      { status: 503 },
    );
  }

  if (
    !isWorkerAuthorized(env.cronSecret, {
      authorization: request.headers.get("authorization"),
      workerSecret: request.headers.get("x-cron-secret"),
    })
  ) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runWorkerTick();
    return Response.json(
      { ...result, trigger: "cron" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Scheduled worker run failed", error);
    return Response.json({ error: "Worker run failed." }, { status: 500 });
  }
}

export function POST() {
  return Response.json(
    { error: "Use GET with the Bearer CRON_SECRET; Vercel Cron invokes GET." },
    { status: 405, headers: { Allow: "GET" } },
  );
}
