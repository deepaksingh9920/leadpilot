import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createTempDatabase, createTestTenant } from "@/test/temp-db";

// The Prisma client and the env module read configuration at import time, so
// every flag must be set before the dynamic imports below. Razorpay itself is
// never contacted: global fetch is stubbed with recorded provider responses.
const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;
process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-bytes-long";
process.env.APP_URL = "https://app.leadpilot.test";
process.env.BILLING_PROVIDER = "razorpay";
process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_secret";
process.env.RAZORPAY_API_BASE_URL = "https://api.razorpay.test/v1";

const { db } = await import("@/lib/db");
const {
  cancelWorkspaceSubscription,
  getBillingState,
  processRazorpayWebhook,
  startSubscriptionCheckout,
} = await import("@/server/services/billing");

type Tenant = Awaited<ReturnType<typeof createTestTenant>>;

const ENTITY_DEFAULTS = {
  id: "sub_test_001",
  status: "active",
  planId: "plan_monthly_001",
  customerId: "cust_test_001",
};

let freePlan: { id: string };
let paidPlan: { id: string };
let unmappedPlan: { id: string };

const DAY_SECONDS = 24 * 60 * 60;

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function entity(overrides: {
  id?: string;
  status?: string;
  planId?: string;
  notes?: Record<string, string>;
  cancelAtCycleEnd?: boolean;
  currentEnd?: number;
} = {}) {
  const now = unixNow();
  return {
    id: overrides.id ?? ENTITY_DEFAULTS.id,
    status: overrides.status ?? ENTITY_DEFAULTS.status,
    plan_id: overrides.planId ?? ENTITY_DEFAULTS.planId,
    customer_id: ENTITY_DEFAULTS.customerId,
    current_start: now,
    current_end: overrides.currentEnd ?? now + 30 * DAY_SECONDS,
    cancel_at_cycle_end: overrides.cancelAtCycleEnd ? 1 : 0,
    short_url: "https://rzp.io/i/checkout-001",
    notes: overrides.notes ?? {
      workspaceId: "unset",
      planId: paidPlan.id,
      interval: "MONTHLY",
    },
  };
}

function webhookBody(event: string, subscription: unknown): string {
  return JSON.stringify({
    event,
    payload: { subscription: { entity: subscription } },
  });
}

function stubFetch(
  body: unknown,
  status = 200,
): { url: string; init: RequestInit | undefined }[] {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

async function workspace(key: string): Promise<Tenant> {
  return createTestTenant(db, { key: `billing-${key}` });
}

async function activateProviderSubscription(
  tenant: Tenant,
  overrides: {
    providerSubscriptionId?: string;
    status?: string;
    interval?: string | null;
    planId?: string;
    currentPeriodEnd?: Date;
  } = {},
): Promise<void> {
  await db.subscription.update({
    where: { workspaceId: tenant.workspace.id },
    data: {
      planId: overrides.planId ?? paidPlan.id,
      status: overrides.status ?? "ACTIVE",
      provider: "razorpay",
      providerSubscriptionId: overrides.providerSubscriptionId ?? "sub_live_001",
      providerCustomerId: ENTITY_DEFAULTS.customerId,
      interval: overrides.interval === undefined ? "MONTHLY" : overrides.interval,
      currentPeriodStart: new Date(),
      currentPeriodEnd:
        overrides.currentPeriodEnd ?? new Date(Date.now() + 30 * DAY_SECONDS * 1000),
      cancelAtPeriodEnd: false,
    },
  });
}

beforeAll(async () => {
  freePlan = await db.plan.create({
    data: {
      key: "free",
      name: "Free",
      description: "Free plan",
      monthlyPrice: 0,
      yearlyPrice: 0,
    },
  });

  paidPlan = await db.plan.create({
    data: {
      key: `starter-${Date.now()}`,
      name: "Starter",
      description: "Paid plan",
      monthlyPrice: 2_900,
      yearlyPrice: 29_000,
      providerPrices: {
        create: [
          { provider: "razorpay", interval: "MONTHLY", externalPlanId: "plan_monthly_001" },
          { provider: "razorpay", interval: "YEARLY", externalPlanId: "plan_yearly_001" },
        ],
      },
    },
  });

  unmappedPlan = await db.plan.create({
    data: {
      key: `unmapped-${Date.now()}`,
      name: "Unmapped",
      description: "Paid plan without provider prices",
      monthlyPrice: 9_900,
      yearlyPrice: 99_000,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

describe("billing state", () => {
  it("reports configuration and only lists mapped checkout intervals", async () => {
    const tenant = await workspace("state");
    const state = await getBillingState(tenant.workspace.id);

    expect(state.configured).toBe(true);
    expect(state.webhooksConfigured).toBe(true);
    expect(state.subscription?.planId).toBe(tenant.plan.id);

    const paid = state.plans.find((plan) => plan.id === paidPlan.id);
    expect(paid?.intervals).toEqual(["MONTHLY", "YEARLY"]);

    const unmapped = state.plans.find((plan) => plan.id === unmappedPlan.id);
    expect(unmapped?.intervals).toEqual([]);
  });
});

describe("Razorpay checkout", () => {
  it("creates a hosted subscription without changing the local plan", async () => {
    const tenant = await workspace("checkout");
    const calls = stubFetch(entity());

    const result = await startSubscriptionCheckout({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      planId: paidPlan.id,
      interval: "monthly",
    });

    expect(result).toMatchObject({
      ok: true,
      subscriptionId: "sub_test_001",
      shortUrl: "https://rzp.io/i/checkout-001",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.razorpay.test/v1/subscriptions");
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from("rzp_test_key:rzp_test_secret").toString("base64")}`,
    );
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      plan_id: "plan_monthly_001",
      total_count: 60,
      quantity: 1,
      customer_notify: 1,
      notes: {
        workspaceId: tenant.workspace.id,
        planId: paidPlan.id,
        interval: "MONTHLY",
      },
    });

    // Payment is not proof of payment: only a verified webhook may move plans.
    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenant.workspace.id },
    });
    expect(subscription?.planId).toBe(tenant.plan.id);
    expect(subscription?.providerSubscriptionId).toBeNull();

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "billing.checkout_started" },
    });
    expect(audit?.entityId).toBe("sub_test_001");
  });

  it("uses the yearly provider plan and five cycles for annual billing", async () => {
    const tenant = await workspace("checkout-yearly");
    const calls = stubFetch(entity({ planId: "plan_yearly_001" }));

    const result = await startSubscriptionCheckout({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      planId: paidPlan.id,
      interval: "YEARLY",
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.plan_id).toBe("plan_yearly_001");
    expect(body.total_count).toBe(5);
    expect(body.notes.interval).toBe("YEARLY");
  });

  it("rejects an invalid interval before calling Razorpay", async () => {
    const tenant = await workspace("checkout-bad-interval");
    const calls = stubFetch(entity());

    const result = await startSubscriptionCheckout({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      planId: paidPlan.id,
      interval: "weekly",
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID" });
    expect(calls).toHaveLength(0);
  });

  it("rejects a plan without a mapped Razorpay price", async () => {
    const tenant = await workspace("checkout-unmapped");
    const calls = stubFetch(entity());

    const result = await startSubscriptionCheckout({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      planId: unmappedPlan.id,
      interval: "MONTHLY",
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID" });
    expect(result.ok === false && result.message).toMatch(/no Razorpay monthly price/);
    expect(calls).toHaveLength(0);
  });

  it("does not check out the Free plan", async () => {
    const tenant = await workspace("checkout-free");
    const calls = stubFetch(entity());

    const result = await startSubscriptionCheckout({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      planId: freePlan.id,
      interval: "MONTHLY",
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID" });
    expect(calls).toHaveLength(0);
  });

  it("refuses a second subscription while one is already active", async () => {
    const tenant = await workspace("checkout-conflict");
    await activateProviderSubscription(tenant, { providerSubscriptionId: "sub_live_conflict" });
    const calls = stubFetch(entity());

    const same = await startSubscriptionCheckout({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      planId: paidPlan.id,
      interval: "MONTHLY",
    });
    expect(same).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(same.ok === false && same.message).toMatch(/already on that plan/);

    const other = await startSubscriptionCheckout({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      planId: paidPlan.id,
      interval: "YEARLY",
    });
    expect(other).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(other.ok === false && other.message).toMatch(/Cancel the current subscription/);
    expect(calls).toHaveLength(0);
  });

  it("rejects a payment link outside Razorpay instead of redirecting", async () => {
    const tenant = await workspace("checkout-redirect");
    stubFetch({ ...entity(), short_url: "https://evil.example/checkout" });

    const result = await startSubscriptionCheckout({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      planId: paidPlan.id,
      interval: "MONTHLY",
    });

    expect(result).toMatchObject({ ok: false, code: "UPSTREAM" });
    expect(result.ok === false && result.message).toMatch(/unexpected payment link host/);

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "billing.checkout_started" },
    });
    expect(audit).toBeNull();
  });

  it("surfaces a Razorpay error without writing local billing state", async () => {
    const tenant = await workspace("checkout-upstream");
    stubFetch({ error: { description: "Plan not found" } }, 400);

    const result = await startSubscriptionCheckout({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      planId: paidPlan.id,
      interval: "MONTHLY",
    });

    expect(result).toMatchObject({ ok: false, code: "UPSTREAM" });
    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenant.workspace.id },
    });
    expect(subscription?.providerSubscriptionId).toBeNull();
    expect(subscription?.planId).toBe(tenant.plan.id);
  });
});

describe("Razorpay webhooks", () => {
  it("activates the mapped plan from a verified subscription event", async () => {
    const tenant = await workspace("webhook-activate");
    const rawBody = webhookBody(
      "subscription.activated",
      entity({
        notes: {
          workspaceId: tenant.workspace.id,
          planId: paidPlan.id,
          interval: "MONTHLY",
        },
      }),
    );

    const result = await processRazorpayWebhook({
      externalEventId: "evt_activate_001",
      rawBody,
    });

    expect(result).toEqual({ ok: true, applied: true, duplicate: false });

    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenant.workspace.id },
    });
    expect(subscription).toMatchObject({
      planId: paidPlan.id,
      status: "ACTIVE",
      provider: "razorpay",
      providerSubscriptionId: "sub_test_001",
      providerCustomerId: ENTITY_DEFAULTS.customerId,
      interval: "MONTHLY",
      cancelAtPeriodEnd: false,
    });
    expect(subscription?.currentPeriodStart).toBeInstanceOf(Date);
    expect(subscription?.currentPeriodEnd).toBeInstanceOf(Date);

    const event = await db.webhookEvent.findUnique({
      where: {
        provider_externalEventId: {
          provider: "razorpay",
          externalEventId: "evt_activate_001",
        },
      },
    });
    expect(event?.payload).toBe(rawBody);
    expect(event?.processedAt).toBeInstanceOf(Date);

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "billing.webhook_applied" },
    });
    expect(audit?.entityId).toBe("sub_test_001");
  });

  it("applies a replayed event exactly once", async () => {
    const tenant = await workspace("webhook-replay");
    const rawBody = webhookBody(
      "subscription.activated",
      entity({
        notes: {
          workspaceId: tenant.workspace.id,
          planId: paidPlan.id,
          interval: "MONTHLY",
        },
      }),
    );

    const first = await processRazorpayWebhook({
      externalEventId: "evt_replay_001",
      rawBody,
    });
    expect(first).toEqual({ ok: true, applied: true, duplicate: false });

    const replay = await processRazorpayWebhook({
      externalEventId: "evt_replay_001",
      rawBody,
    });
    expect(replay).toEqual({ ok: true, applied: false, duplicate: true });

    expect(
      await db.webhookEvent.count({ where: { externalEventId: "evt_replay_001" } }),
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: { workspaceId: tenant.workspace.id, action: "billing.webhook_applied" },
      }),
    ).toBe(1);
  });

  it("maps an unmapped local plan through its external Razorpay plan id", async () => {
    const tenant = await workspace("webhook-plan-map");
    const rawBody = webhookBody(
      "subscription.activated",
      entity({
        planId: "plan_yearly_001",
        notes: { workspaceId: tenant.workspace.id },
      }),
    );

    const result = await processRazorpayWebhook({
      externalEventId: "evt_plan_map_001",
      rawBody,
    });

    expect(result).toEqual({ ok: true, applied: true, duplicate: false });
    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenant.workspace.id },
    });
    expect(subscription?.planId).toBe(paidPlan.id);
    expect(subscription?.status).toBe("ACTIVE");
  });

  it("keeps the paid plan active when cancellation is scheduled for period end", async () => {
    const tenant = await workspace("webhook-cancel-later");
    await activateProviderSubscription(tenant, { providerSubscriptionId: "sub_cancel_later" });
    const rawBody = webhookBody(
      "subscription.cancelled",
      entity({
        id: "sub_cancel_later",
        status: "cancelled",
        cancelAtCycleEnd: true,
        currentEnd: unixNow() + 10 * DAY_SECONDS,
        notes: {
          workspaceId: tenant.workspace.id,
          planId: paidPlan.id,
          interval: "MONTHLY",
        },
      }),
    );

    const result = await processRazorpayWebhook({
      externalEventId: "evt_cancel_later_001",
      rawBody,
    });
    expect(result).toEqual({ ok: true, applied: true, duplicate: false });

    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenant.workspace.id },
    });
    expect(subscription).toMatchObject({
      planId: paidPlan.id,
      status: "ACTIVE",
      cancelAtPeriodEnd: true,
      interval: "MONTHLY",
    });
  });

  it("downgrades to Free on an immediate cancellation", async () => {
    const tenant = await workspace("webhook-cancel-now");
    await activateProviderSubscription(tenant, { providerSubscriptionId: "sub_cancel_now" });
    const rawBody = webhookBody(
      "subscription.cancelled",
      entity({
        id: "sub_cancel_now",
        status: "cancelled",
        cancelAtCycleEnd: false,
        notes: {
          workspaceId: tenant.workspace.id,
          planId: paidPlan.id,
          interval: "MONTHLY",
        },
      }),
    );

    const result = await processRazorpayWebhook({
      externalEventId: "evt_cancel_now_001",
      rawBody,
    });
    expect(result).toEqual({ ok: true, applied: true, duplicate: false });

    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenant.workspace.id },
    });
    expect(subscription).toMatchObject({
      planId: freePlan.id,
      status: "CANCELED",
      interval: null,
      cancelAtPeriodEnd: false,
    });
  });

  it("maps halt and pause events to past-due and paused", async () => {
    const tenant = await workspace("webhook-status");
    await activateProviderSubscription(tenant, { providerSubscriptionId: "sub_status" });

    const notes = {
      workspaceId: tenant.workspace.id,
      planId: paidPlan.id,
      interval: "MONTHLY",
    };

    await processRazorpayWebhook({
      externalEventId: "evt_halted_001",
      rawBody: webhookBody(
        "subscription.halted",
        entity({ id: "sub_status", status: "halted", notes }),
      ),
    });
    expect(
      (await db.subscription.findUnique({ where: { workspaceId: tenant.workspace.id } }))
        ?.status,
    ).toBe("PAST_DUE");

    await processRazorpayWebhook({
      externalEventId: "evt_paused_001",
      rawBody: webhookBody(
        "subscription.paused",
        entity({ id: "sub_status", status: "paused", notes }),
      ),
    });
    expect(
      (await db.subscription.findUnique({ where: { workspaceId: tenant.workspace.id } }))
        ?.status,
    ).toBe("PAUSED");

    await processRazorpayWebhook({
      externalEventId: "evt_resumed_001",
      rawBody: webhookBody(
        "subscription.resumed",
        entity({ id: "sub_status", status: "active", notes }),
      ),
    });
    expect(
      (await db.subscription.findUnique({ where: { workspaceId: tenant.workspace.id } }))
        ?.status,
    ).toBe("ACTIVE");
  });

  it("never applies an event to another workspace", async () => {
    const tenantA = await workspace("isolation-a");
    const tenantB = await workspace("isolation-b");

    const result = await processRazorpayWebhook({
      externalEventId: "evt_isolation_001",
      rawBody: webhookBody(
        "subscription.activated",
        entity({
          notes: {
            workspaceId: tenantA.workspace.id,
            planId: paidPlan.id,
            interval: "MONTHLY",
          },
        }),
      ),
    });

    expect(result).toEqual({ ok: true, applied: true, duplicate: false });
    expect(
      (await db.subscription.findUnique({ where: { workspaceId: tenantA.workspace.id } }))
        ?.planId,
    ).toBe(paidPlan.id);

    const untouched = await db.subscription.findUnique({
      where: { workspaceId: tenantB.workspace.id },
    });
    expect(untouched?.planId).toBe(tenantB.plan.id);
    expect(untouched?.providerSubscriptionId).toBeNull();
  });

  it("acknowledges unknown workspaces and unrelated events without changes", async () => {
    const tenant = await workspace("webhook-unrelated");

    const unknown = await processRazorpayWebhook({
      externalEventId: "evt_unknown_ws_001",
      rawBody: webhookBody(
        "subscription.activated",
        entity({
          notes: { workspaceId: "does-not-exist", planId: paidPlan.id, interval: "MONTHLY" },
        }),
      ),
    });
    expect(unknown).toEqual({ ok: true, applied: false, duplicate: false });

    const payment = await processRazorpayWebhook({
      externalEventId: "evt_payment_001",
      rawBody: JSON.stringify({ event: "payment.captured", payload: {} }),
    });
    expect(payment).toEqual({ ok: true, applied: false, duplicate: false });

    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenant.workspace.id },
    });
    expect(subscription?.planId).toBe(tenant.plan.id);
  });

  it("rejects malformed payloads before touching billing state", async () => {
    const invalidJson = await processRazorpayWebhook({
      externalEventId: "evt_invalid_json_001",
      rawBody: "{not json",
    });
    expect(invalidJson).toMatchObject({ ok: false, code: "INVALID" });

    const notAnEvent = await processRazorpayWebhook({
      externalEventId: "evt_not_event_001",
      rawBody: JSON.stringify({ hello: "world" }),
    });
    expect(notAnEvent).toMatchObject({ ok: false, code: "INVALID" });

    expect(
      await db.webhookEvent.count({
        where: { externalEventId: { in: ["evt_invalid_json_001", "evt_not_event_001"] } },
      }),
    ).toBe(0);
  });
});

describe("Razorpay cancellation", () => {
  it("requests cancellation at the end of the paid period and keeps access", async () => {
    const tenant = await workspace("cancel-later");
    const currentPeriodEnd = new Date(Date.now() + 20 * DAY_SECONDS * 1000);
    await activateProviderSubscription(tenant, {
      providerSubscriptionId: "sub_cancel_action",
      currentPeriodEnd,
    });
    const calls = stubFetch(
      entity({
        id: "sub_cancel_action",
        status: "active",
        cancelAtCycleEnd: true,
        currentEnd: Math.floor(currentPeriodEnd.getTime() / 1000),
      }),
    );

    const result = await cancelWorkspaceSubscription({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      atCycleEnd: true,
    });

    expect(result).toEqual({ ok: true });
    expect(calls[0].url).toBe(
      "https://api.razorpay.test/v1/subscriptions/sub_cancel_action/cancel",
    );
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ cancel_at_cycle_end: 1 });

    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenant.workspace.id },
    });
    expect(subscription).toMatchObject({
      planId: paidPlan.id,
      status: "ACTIVE",
      cancelAtPeriodEnd: true,
      interval: "MONTHLY",
    });

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "billing.subscription_canceled" },
    });
    expect(audit?.metadata).toContain('"atCycleEnd":true');
  });

  it("cancels immediately when requested", async () => {
    const tenant = await workspace("cancel-now");
    await activateProviderSubscription(tenant, {
      providerSubscriptionId: "sub_cancel_now_action",
    });
    stubFetch(
      entity({ id: "sub_cancel_now_action", status: "cancelled", cancelAtCycleEnd: false }),
    );

    const result = await cancelWorkspaceSubscription({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      atCycleEnd: false,
    });

    expect(result).toEqual({ ok: true });
    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenant.workspace.id },
    });
    expect(subscription).toMatchObject({
      status: "CANCELED",
      cancelAtPeriodEnd: false,
      interval: null,
    });
  });

  it("refuses to cancel without a provider subscription", async () => {
    const tenant = await workspace("cancel-none");
    const calls = stubFetch(entity());

    const result = await cancelWorkspaceSubscription({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      atCycleEnd: true,
    });

    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(calls).toHaveLength(0);
  });

  it("refuses to cancel an already canceled subscription", async () => {
    const tenant = await workspace("cancel-done");
    await activateProviderSubscription(tenant, {
      providerSubscriptionId: "sub_cancel_done",
      status: "CANCELED",
    });
    const calls = stubFetch(entity());

    const result = await cancelWorkspaceSubscription({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      atCycleEnd: true,
    });

    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(calls).toHaveLength(0);
  });

  it("leaves local state untouched when Razorpay rejects the cancellation", async () => {
    const tenant = await workspace("cancel-upstream");
    await activateProviderSubscription(tenant, {
      providerSubscriptionId: "sub_cancel_upstream",
    });
    stubFetch({ error: { description: "Subscription cannot be canceled" } }, 400);

    const result = await cancelWorkspaceSubscription({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      atCycleEnd: true,
    });

    expect(result).toMatchObject({ ok: false, code: "UPSTREAM" });
    const subscription = await db.subscription.findUnique({
      where: { workspaceId: tenant.workspace.id },
    });
    expect(subscription).toMatchObject({
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      providerSubscriptionId: "sub_cancel_upstream",
    });
    expect(
      await db.auditLog.count({
        where: { workspaceId: tenant.workspace.id, action: "billing.subscription_canceled" },
      }),
    ).toBe(0);
  });
});
