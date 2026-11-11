import { checkRateLimit } from "@/lib/auth/rate-limit";
import { RATE_LIMITS } from "@/lib/auth/rate-limits";
import { getAuthContext, roleAtLeast } from "@/lib/auth/workspace";
import { getClientIp, getUserAgent } from "@/lib/request";
import { exportWorkspaceData } from "@/server/services/compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }
  if (!roleAtLeast(context.role, "ADMIN")) {
    return Response.json(
      { error: "Only workspace admins can export workspace data." },
      { status: 403 },
    );
  }

  const limit = await checkRateLimit(
    `workspace-export:${context.user.id}`,
    RATE_LIMITS.dataExport.limit,
    RATE_LIMITS.dataExport.windowSeconds,
  );
  if (!limit.allowed) {
    return Response.json(
      {
        error: `Too many exports. Try again in about ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const data = await exportWorkspaceData({
    workspaceId: context.workspace.id,
    actorId: context.user.id,
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });
  if (!data) {
    return Response.json({ error: "Workspace not found." }, { status: 404 });
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="leadpilot-${context.workspace.slug}-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
