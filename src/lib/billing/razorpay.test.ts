import { describe, expect, it } from "vitest";

import {
  cancelRazorpaySubscription,
  createRazorpaySubscription,
  fetchRazorpaySubscription,
  parseRazorpaySubscription,
  parseRazorpayWebhook,
  razorpaySignature,
  verifyRazorpaySignature,
} from "@/lib/billing/razorpay";
import type { FetchLike } from "@/lib/providers/http";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function captureFetch(body: unknown): {
  fetchImpl: FetchLike;
  calls: { url: string; init: RequestInit | undefined }[];
} {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ url: String(input), init });
    return json(body);
  };
  return { fetchImpl, calls };
}

const OPTIONS = {
  keyId: "rzp_test_key",
  keySecret: "rzp_test_secret",
  baseUrl: "https://api.razorpay.test/v1/",
};

const ENTITY = {
  id: "sub_test_001",
  status: "active",
  plan_id: "plan_monthly_001",
  customer_id: "cust_001",
  current_start: 1_762_000_000,
  current_end: 1_764_592_000,
  cancel_at_cycle_end: 1,
  short_url: "https://rzp.io/i/checkout-001",
  notes: { workspaceId: "ws_1", planId: "plan_local_1", interval: "MONTHLY", numeric: 5 },
};

const EXPECTED_AUTH = `Basic ${Buffer.from("rzp_test_key:rzp_test_secret").toString("base64")}`;

describe("Razorpay subscription parsing", () => {
  it("maps a provider entity without inventing missing fields", () => {
    const parsed = parseRazorpaySubscription(ENTITY);

    expect(parsed).toEqual({
      id: "sub_test_001",
      status: "active",
      planId: "plan_monthly_001",
      customerId: "cust_001",
      currentStart: new Date(1_762_000_000 * 1000),
      currentEnd: new Date(1_764_592_000 * 1000),
      cancelAtCycleEnd: true,
      shortUrl: "https://rzp.io/i/checkout-001",
      notes: { workspaceId: "ws_1", planId: "plan_local_1", interval: "MONTHLY" },
    });
  });

  it("treats missing optional fields as absent", () => {
    const parsed = parseRazorpaySubscription({ id: "sub_2", status: "created" });

    expect(parsed.planId).toBe("");
    expect(parsed.customerId).toBeNull();
    expect(parsed.currentStart).toBeNull();
    expect(parsed.currentEnd).toBeNull();
    expect(parsed.cancelAtCycleEnd).toBe(false);
    expect(parsed.shortUrl).toBeNull();
    expect(parsed.notes).toEqual({});
  });

  it("rejects a response without an id or status", () => {
    expect(() => parseRazorpaySubscription({ status: "active" })).toThrow(/id or status/);
    expect(() => parseRazorpaySubscription({ id: "sub_3" })).toThrow(/id or status/);
    expect(() => parseRazorpaySubscription(null)).toThrow(/id or status/);
  });
});

describe("Razorpay subscription requests", () => {
  it("creates a subscription with Basic auth, clamped cycle count, and notes", async () => {
    const { fetchImpl, calls } = captureFetch(ENTITY);

    const checkout = await createRazorpaySubscription(
      {
        providerPlanId: "plan_monthly_001",
        totalCount: 500,
        quantity: 0,
        notes: { workspaceId: "ws_1", planId: "plan_local_1", interval: "MONTHLY" },
      },
      { ...OPTIONS, fetchImpl },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.razorpay.test/v1/subscriptions");
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe(EXPECTED_AUTH);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      plan_id: "plan_monthly_001",
      total_count: 100,
      quantity: 1,
      customer_notify: 1,
      notes: { workspaceId: "ws_1", planId: "plan_local_1", interval: "MONTHLY" },
    });
    expect(checkout).toEqual({
      subscriptionId: "sub_test_001",
      shortUrl: "https://rzp.io/i/checkout-001",
    });
  });

  it("never sends a cycle count below one", async () => {
    const { fetchImpl, calls } = captureFetch(ENTITY);

    await createRazorpaySubscription(
      { providerPlanId: "plan_monthly_001", totalCount: 0, notes: {} },
      { ...OPTIONS, fetchImpl },
    );

    expect(JSON.parse(String(calls[0].init?.body)).total_count).toBe(1);
  });

  it("fetches a subscription by encoded id", async () => {
    const { fetchImpl, calls } = captureFetch(ENTITY);

    const subscription = await fetchRazorpaySubscription("sub id/1", {
      ...OPTIONS,
      fetchImpl,
    });

    expect(calls[0].url).toBe("https://api.razorpay.test/v1/subscriptions/sub%20id%2F1");
    expect(calls[0].init?.method).toBe("GET");
    expect(calls[0].init?.body).toBeUndefined();
    expect(subscription.id).toBe("sub_test_001");
  });

  it("cancels at cycle end or immediately", async () => {
    const cycle = captureFetch(ENTITY);
    await cancelRazorpaySubscription("sub_test_001", true, {
      ...OPTIONS,
      fetchImpl: cycle.fetchImpl,
    });
    expect(cycle.calls[0].url).toBe(
      "https://api.razorpay.test/v1/subscriptions/sub_test_001/cancel",
    );
    expect(cycle.calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(cycle.calls[0].init?.body))).toEqual({
      cancel_at_cycle_end: 1,
    });

    const immediate = captureFetch(ENTITY);
    await cancelRazorpaySubscription("sub_test_001", false, {
      ...OPTIONS,
      fetchImpl: immediate.fetchImpl,
    });
    expect(JSON.parse(String(immediate.calls[0].init?.body))).toEqual({
      cancel_at_cycle_end: 0,
    });
  });

  it("surfaces provider failures instead of returning a fabricated subscription", async () => {
    const fetchImpl: FetchLike = async () =>
      json({ error: { description: "Authentication failed" } }, 401);

    await expect(
      createRazorpaySubscription(
        { providerPlanId: "plan_monthly_001", totalCount: 60, notes: {} },
        { ...OPTIONS, fetchImpl },
      ),
    ).rejects.toThrow(/HTTP 401/);
  });
});

describe("Razorpay webhook signatures", () => {
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ event: "subscription.activated" });

  it("accepts the exact raw body with the expected HMAC", () => {
    const signature = razorpaySignature(body, secret);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyRazorpaySignature(body, signature, secret)).toBe(true);
    expect(verifyRazorpaySignature(body, signature.toUpperCase(), secret)).toBe(true);
  });

  it("rejects a tampered body, wrong secret, missing signature, and empty secret", () => {
    const signature = razorpaySignature(body, secret);

    expect(verifyRazorpaySignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyRazorpaySignature(body, signature, "wrong-secret")).toBe(false);
    expect(verifyRazorpaySignature(body, "", secret)).toBe(false);
    expect(verifyRazorpaySignature(body, null, secret)).toBe(false);
    expect(verifyRazorpaySignature(body, signature, "")).toBe(false);
    expect(verifyRazorpaySignature(body, "1234", secret)).toBe(false);
    expect(verifyRazorpaySignature(body, "z".repeat(64), secret)).toBe(false);
  });
});

describe("Razorpay webhook parsing", () => {
  it("extracts the subscription entity from an event payload", () => {
    const parsed = parseRazorpayWebhook({
      event: "subscription.activated",
      payload: { subscription: { entity: ENTITY } },
    });

    expect(parsed?.event).toBe("subscription.activated");
    expect(parsed?.subscription?.id).toBe("sub_test_001");
    expect(parsed?.subscription?.notes.workspaceId).toBe("ws_1");
  });

  it("acknowledges unrelated events without a subscription", () => {
    const parsed = parseRazorpayWebhook({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_1" } } },
    });

    expect(parsed).toEqual({ event: "payment.captured", subscription: null });
  });

  it("rejects bodies that are not Razorpay events", () => {
    expect(parseRazorpayWebhook(null)).toBeNull();
    expect(parseRazorpayWebhook({})).toBeNull();
    expect(parseRazorpayWebhook({ event: 42 })).toBeNull();
    expect(parseRazorpayWebhook("subscription.activated")).toBeNull();
  });
});
