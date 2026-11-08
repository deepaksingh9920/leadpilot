import { createHash } from "node:crypto";

import { env } from "@/lib/env";
import { verifyRazorpaySignature } from "@/lib/billing/razorpay";
import { processRazorpayWebhook } from "@/server/services/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

/**
 * Razorpay webhook endpoint.
 *
 * The raw body is verified against X-Razorpay-Signature before parsing. Events
 * are applied exactly once via the WebhookEvent table; replays return 200 so
 * Razorpay stops retrying. When the webhook secret is not configured the route
 * refuses events instead of accepting unverified state changes.
 */
export async function POST(request: Request) {
  if (!env.razorpayWebhookSecret) {
    return Response.json(
      { ok: false, error: "Razorpay webhooks are not configured." },
      { status: 503 },
    );
  }

  const tooLarge = request.headers.get("content-length");
  if (tooLarge && Number.parseInt(tooLarge, 10) > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "Payload too large." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "Payload too large." }, { status: 413 });
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!verifyRazorpaySignature(rawBody, signature, env.razorpayWebhookSecret)) {
    return Response.json({ ok: false, error: "Invalid signature." }, { status: 401 });
  }

  const externalEventId =
    request.headers.get("x-razorpay-event-id") ??
    createHash("sha256").update(rawBody, "utf8").digest("hex");

  try {
    const result = await processRazorpayWebhook({ externalEventId, rawBody });
    if (!result.ok) {
      return Response.json({ ok: false, error: result.message }, { status: 400 });
    }
    return Response.json({
      ok: true,
      applied: result.applied,
      duplicate: result.duplicate,
    });
  } catch (error) {
    console.error("Razorpay webhook processing failed", {
      eventId: externalEventId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return Response.json({ ok: false, error: "Webhook processing failed." }, { status: 500 });
  }
}
