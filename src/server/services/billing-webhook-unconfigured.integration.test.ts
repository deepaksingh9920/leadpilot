import { afterEach, describe, expect, it, vi } from "vitest";

// API keys exist but the webhook secret does not. Checkout must stay closed,
// because a payment taken without a verified activation path would leave the
// customer paid and the workspace stuck on Free.
process.env.BILLING_PROVIDER = "razorpay";
process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
delete process.env.RAZORPAY_WEBHOOK_SECRET;

const { startSubscriptionCheckout } = await import("@/server/services/billing");
const { POST } = await import("@/app/api/billing/razorpay/route");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("billing without a webhook secret", () => {
  it("refuses checkout so payment cannot be taken without activation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await startSubscriptionCheckout({
      workspaceId: "ws_no_webhook",
      actorId: "user_no_webhook",
      planId: "plan_no_webhook",
      interval: "MONTHLY",
    });

    expect(result).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
    expect(result.ok === false && result.message).toMatch(/RAZORPAY_WEBHOOK_SECRET/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses unverified webhook deliveries", async () => {
    const response = await POST(
      new Request("https://app.leadpilot.test/api/billing/razorpay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": "deadbeef",
          "x-razorpay-event-id": "evt_no_webhook_001",
        },
        body: JSON.stringify({ event: "subscription.activated", payload: {} }),
      }),
    );

    expect(response.status).toBe(503);
  });
});
