import { afterEach, describe, expect, it, vi } from "vitest";

// No billing credentials are configured in this file. The adapter must refuse
// to start checkout or a cancellation instead of falling back to fake state.
delete process.env.BILLING_PROVIDER;
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;
delete process.env.RAZORPAY_WEBHOOK_SECRET;

const { cancelWorkspaceSubscription, startSubscriptionCheckout } = await import(
  "@/server/services/billing"
);
const { POST } = await import("@/app/api/billing/razorpay/route");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("billing without Razorpay credentials", () => {
  it("refuses checkout before calling any provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await startSubscriptionCheckout({
      workspaceId: "ws_unconfigured",
      actorId: "user_unconfigured",
      planId: "plan_unconfigured",
      interval: "MONTHLY",
    });

    expect(result).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
    expect(result.ok === false && result.message).toMatch(/RAZORPAY_KEY_ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses cancellation before calling any provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelWorkspaceSubscription({
      workspaceId: "ws_unconfigured",
      actorId: "user_unconfigured",
      atCycleEnd: true,
    });

    expect(result).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses unverified webhook deliveries", async () => {
    const response = await POST(
      new Request("https://app.leadpilot.test/api/billing/razorpay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": "deadbeef",
          "x-razorpay-event-id": "evt_unconfigured_001",
        },
        body: JSON.stringify({ event: "subscription.activated", payload: {} }),
      }),
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not configured/i);
  });
});
