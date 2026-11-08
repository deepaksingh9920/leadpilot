/**
 * Razorpay billing adapter.
 *
 * Subscriptions are created server-side and paid on Razorpay's hosted
 * `short_url`, so the app never needs a client-side checkout script. Webhook
 * bodies are verified with the webhook secret before any state is touched.
 *
 * Nothing here is simulated: every call goes to the Razorpay API and every
 * failure is surfaced. The adapter is only used when RAZORPAY_KEY_ID and
 * RAZORPAY_KEY_SECRET are configured.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { requestJson, trimTrailingSlash, type FetchLike } from "@/lib/providers/http";
import { isRecord } from "@/lib/providers/types";

export const RAZORPAY_DEFAULT_BASE_URL = "https://api.razorpay.com/v1";

export type RazorpayOptions = {
  keyId: string;
  keySecret: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
};

export type RazorpaySubscription = {
  id: string;
  status: string;
  planId: string;
  customerId: string | null;
  currentStart: Date | null;
  currentEnd: Date | null;
  cancelAtCycleEnd: boolean;
  shortUrl: string | null;
  notes: Record<string, string>;
};

export type RazorpayCheckout = {
  subscriptionId: string;
  shortUrl: string | null;
};

function authHeader(options: RazorpayOptions): string {
  return `Basic ${Buffer.from(`${options.keyId}:${options.keySecret}`).toString("base64")}`;
}

function baseUrl(options: RazorpayOptions): string {
  return trimTrailingSlash(options.baseUrl ?? RAZORPAY_DEFAULT_BASE_URL);
}

function unixDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000);
}

function readNotes(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const notes: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") notes[key] = raw;
  }
  return notes;
}

export function parseRazorpaySubscription(value: unknown): RazorpaySubscription {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.status !== "string") {
    throw new Error("Razorpay subscription response was missing an id or status.");
  }
  return {
    id: value.id,
    status: value.status,
    planId: typeof value.plan_id === "string" ? value.plan_id : "",
    customerId: typeof value.customer_id === "string" ? value.customer_id : null,
    currentStart: unixDate(value.current_start),
    currentEnd: unixDate(value.current_end),
    cancelAtCycleEnd: value.cancel_at_cycle_end === true || value.cancel_at_cycle_end === 1,
    shortUrl: typeof value.short_url === "string" ? value.short_url : null,
    notes: readNotes(value.notes),
  };
}

/** Creates a subscription and returns its provider id plus hosted payment link. */
export async function createRazorpaySubscription(
  input: {
    providerPlanId: string;
    totalCount: number;
    quantity?: number;
    notes: Record<string, string>;
  },
  options: RazorpayOptions,
): Promise<RazorpayCheckout> {
  const body = await requestJson({
    provider: "Razorpay",
    url: `${baseUrl(options)}/subscriptions`,
    method: "POST",
    headers: { authorization: authHeader(options) },
    body: {
      plan_id: input.providerPlanId,
      total_count: Math.max(1, Math.min(100, Math.trunc(input.totalCount))),
      quantity: Math.max(1, Math.trunc(input.quantity ?? 1)),
      customer_notify: 1,
      notes: input.notes,
    },
    timeoutMs: options.timeoutMs ?? 20_000,
    fetchImpl: options.fetchImpl,
  });

  const subscription = parseRazorpaySubscription(body);
  return { subscriptionId: subscription.id, shortUrl: subscription.shortUrl };
}

export async function fetchRazorpaySubscription(
  subscriptionId: string,
  options: RazorpayOptions,
): Promise<RazorpaySubscription> {
  const body = await requestJson({
    provider: "Razorpay",
    url: `${baseUrl(options)}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    method: "GET",
    headers: { authorization: authHeader(options) },
    timeoutMs: options.timeoutMs ?? 20_000,
    fetchImpl: options.fetchImpl,
  });
  return parseRazorpaySubscription(body);
}

/**
 * Cancels a subscription. `atCycleEnd` keeps access until the paid period
 * ends; passing false cancels immediately.
 */
export async function cancelRazorpaySubscription(
  subscriptionId: string,
  atCycleEnd: boolean,
  options: RazorpayOptions,
): Promise<RazorpaySubscription> {
  const body = await requestJson({
    provider: "Razorpay",
    url: `${baseUrl(options)}/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    method: "POST",
    headers: { authorization: authHeader(options) },
    body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 },
    timeoutMs: options.timeoutMs ?? 20_000,
    fetchImpl: options.fetchImpl,
  });
  return parseRazorpaySubscription(body);
}

/** HMAC-SHA256 of the exact raw request body, hex encoded. */
export function razorpaySignature(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * Verifies the `X-Razorpay-Signature` header against the raw body. Comparison
 * is constant-time and rejects malformed or empty signatures.
 */
export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = razorpaySignature(rawBody, secret);
  const received = signature.trim().toLowerCase();
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"));
}

export type RazorpayWebhookEvent = {
  event: string;
  subscription: RazorpaySubscription | null;
};

/**
 * Reads the subscription entity from a Razorpay webhook body. Event types
 * without a subscription payload return null and are acknowledged without
 * changing billing state.
 */
export function parseRazorpayWebhook(body: unknown): RazorpayWebhookEvent | null {
  if (!isRecord(body) || typeof body.event !== "string") return null;
  const payload = isRecord(body.payload) ? body.payload : {};
  const subscription = isRecord(payload.subscription) ? payload.subscription.entity : null;
  if (!subscription) return { event: body.event, subscription: null };
  return { event: body.event, subscription: parseRazorpaySubscription(subscription) };
}
