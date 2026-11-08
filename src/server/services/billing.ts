import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  cancelRazorpaySubscription,
  createRazorpaySubscription,
  parseRazorpayWebhook,
  type RazorpaySubscription,
} from "@/lib/billing/razorpay";

export const BILLING_INTERVALS = ["MONTHLY", "YEARLY"] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const BILLING_INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

export const BILLING_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  PENDING: "Pending payment",
  TRIALING: "Trialing",
  PAST_DUE: "Past due",
  PAUSED: "Paused",
  CANCELED: "Canceled",
};

export type BillingFailure = {
  ok: false;
  code: "INVALID" | "NOT_FOUND" | "CONFLICT" | "NOT_CONFIGURED" | "UPSTREAM";
  message: string;
};

const FREE_PLAN_KEY = "free";

function isInterval(value: string): value is BillingInterval {
  return (BILLING_INTERVALS as readonly string[]).includes(value);
}

/**
 * Only redirect to links we know belong to Razorpay. A compromised or
 * misconfigured API response must not turn the checkout action into an open
 * redirect.
 */
function isRazorpayHostedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "rzp.io" ||
      host.endsWith(".rzp.io") ||
      host === "razorpay.com" ||
      host.endsWith(".razorpay.com")
    );
  } catch {
    return false;
  }
}

function providerOptions() {
  if (env.billingProvider !== "razorpay") return null;
  if (!env.razorpayKeyId || !env.razorpayKeySecret) return null;
  return {
    keyId: env.razorpayKeyId,
    keySecret: env.razorpayKeySecret,
    baseUrl: env.razorpayBaseUrl,
  };
}

/**
 * Billing data for the settings and admin pages. Provider price mappings are
 * grouped by interval so the UI only offers checkouts that actually exist.
 */
export async function getBillingState(workspaceId: string) {
  const [subscription, plans] = await Promise.all([
    db.subscription.findUnique({
      where: { workspaceId },
      include: {
        plan: { include: { limits: true } },
      },
    }),
    db.plan.findMany({
      where: { isActive: true, isPublic: true },
      orderBy: { sortOrder: "asc" },
      include: {
        limits: true,
        providerPrices: { where: { provider: "razorpay" } },
      },
    }),
  ]);

  return {
    configured: env.billingConfigured && env.billingProvider === "razorpay",
    webhooksConfigured: env.billingWebhooksConfigured,
    subscription,
    plans: plans.map((plan) => ({
      id: plan.id,
      key: plan.key,
      name: plan.name,
      description: plan.description,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      currency: plan.currency,
      intervals: plan.providerPrices.map((price) => price.interval),
    })),
  };
}

/**
 * Creates a Razorpay subscription and returns its hosted payment link.
 * Local plan state is not changed here: the signed webhook is the only thing
 * that can activate a paid plan.
 */
export async function startSubscriptionCheckout(input: {
  workspaceId: string;
  actorId: string;
  planId: string;
  interval: string;
}): Promise<
  { ok: true; subscriptionId: string; shortUrl: string } | BillingFailure
> {
  const options = providerOptions();
  if (!options) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message:
        "Billing is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable checkout.",
    };
  }
  if (!env.razorpayWebhookSecret) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message:
        "Set RAZORPAY_WEBHOOK_SECRET before accepting payments. Without it a paid subscription could never be activated.",
    };
  }

  const interval = input.interval.trim().toUpperCase();
  if (!isInterval(interval)) {
    return { ok: false, code: "INVALID", message: "Choose monthly or yearly billing." };
  }

  const plan = await db.plan.findFirst({
    where: { id: input.planId, isActive: true },
    include: { providerPrices: { where: { provider: "razorpay" } } },
  });
  if (!plan) return { ok: false, code: "NOT_FOUND", message: "Plan not found." };
  if (plan.monthlyPrice === 0 && plan.yearlyPrice === 0) {
    return {
      ok: false,
      code: "INVALID",
      message: "The Free plan does not require checkout.",
    };
  }

  const price = plan.providerPrices.find((row) => row.interval === interval);
  if (!price) {
    return {
      ok: false,
      code: "INVALID",
      message: `The ${plan.name} plan has no Razorpay ${interval.toLowerCase()} price configured yet. Add one in the platform admin console.`,
    };
  }

  const existing = await db.subscription.findUnique({
    where: { workspaceId: input.workspaceId },
    select: {
      planId: true,
      status: true,
      interval: true,
      providerSubscriptionId: true,
    },
  });
  if (
    existing?.providerSubscriptionId &&
    ["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED", "PENDING"].includes(existing.status)
  ) {
    const samePlan = existing.planId === plan.id && existing.interval === interval;
    return {
      ok: false,
      code: "CONFLICT",
      message: samePlan
        ? "This workspace is already on that plan and billing interval."
        : "Cancel the current subscription before starting a new one. Razorpay plan changes are not automated.",
    };
  }

  let checkout;
  try {
    checkout = await createRazorpaySubscription(
      {
        providerPlanId: price.externalPlanId,
        // Razorpay bills a fixed number of cycles. These are generous, not
        // commitments: the customer can cancel at any time.
        totalCount: interval === "MONTHLY" ? 60 : 5,
        notes: {
          workspaceId: input.workspaceId,
          planId: plan.id,
          interval,
        },
      },
      options,
    );
  } catch (error) {
    return {
      ok: false,
      code: "UPSTREAM",
      message:
        error instanceof Error
          ? error.message.slice(0, 300)
          : "Razorpay could not create the subscription.",
    };
  }

  if (!checkout.shortUrl) {
    return {
      ok: false,
      code: "UPSTREAM",
      message: "Razorpay did not return a payment link for this subscription.",
    };
  }
  if (!isRazorpayHostedUrl(checkout.shortUrl)) {
    return {
      ok: false,
      code: "UPSTREAM",
      message: "Razorpay returned an unexpected payment link host.",
    };
  }

  await db.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "billing.checkout_started",
      entityType: "Subscription",
      entityId: checkout.subscriptionId,
      metadata: JSON.stringify({ planId: plan.id, interval }),
    },
  });

  return {
    ok: true,
    subscriptionId: checkout.subscriptionId,
    shortUrl: checkout.shortUrl,
  };
}

/** Cancels the current provider subscription at the end of the paid period. */
export async function cancelWorkspaceSubscription(input: {
  workspaceId: string;
  actorId: string;
  atCycleEnd: boolean;
}): Promise<{ ok: true } | BillingFailure> {
  const options = providerOptions();
  if (!options) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: "Billing is not configured in this environment.",
    };
  }

  const subscription = await db.subscription.findUnique({
    where: { workspaceId: input.workspaceId },
  });
  if (!subscription?.providerSubscriptionId) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "This workspace has no provider subscription to cancel.",
    };
  }
  if (subscription.status === "CANCELED") {
    return { ok: false, code: "CONFLICT", message: "This subscription is already canceled." };
  }

  let providerSubscription;
  try {
    providerSubscription = await cancelRazorpaySubscription(
      subscription.providerSubscriptionId,
      input.atCycleEnd,
      options,
    );
  } catch (error) {
    return {
      ok: false,
      code: "UPSTREAM",
      message:
        error instanceof Error
          ? error.message.slice(0, 300)
          : "Razorpay could not cancel the subscription.",
    };
  }

  await db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { workspaceId: input.workspaceId },
      data: {
        status: input.atCycleEnd ? subscription.status : "CANCELED",
        cancelAtPeriodEnd: input.atCycleEnd,
        currentPeriodEnd: providerSubscription.currentEnd ?? subscription.currentPeriodEnd,
        ...(input.atCycleEnd ? {} : { interval: null }),
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "billing.subscription_canceled",
        entityType: "Subscription",
        entityId: subscription.providerSubscriptionId,
        metadata: JSON.stringify({ atCycleEnd: input.atCycleEnd }),
      },
    });
  });

  return { ok: true };
}

/** Maps a Razorpay subscription status into the local status vocabulary. */
function localStatus(event: string): string | null {
  switch (event) {
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
      return "ACTIVE";
    case "subscription.pending":
    case "subscription.halted":
      return "PAST_DUE";
    case "subscription.paused":
      return "PAUSED";
    case "subscription.cancelled":
    case "subscription.completed":
      return "CANCELED";
    default:
      return null;
  }
}

function isSubscriptionEvent(event: string): boolean {
  return event.startsWith("subscription.");
}

/**
 * Applies a verified Razorpay webhook exactly once. Every write, including the
 * idempotency record, happens in one transaction, so a failure leaves no
 * half-applied state and Razorpay's retry is processed normally.
 */
export async function processRazorpayWebhook(input: {
  externalEventId: string;
  rawBody: string;
}): Promise<{ ok: true; applied: boolean; duplicate: boolean } | BillingFailure> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    return { ok: false, code: "INVALID", message: "Webhook body was not valid JSON." };
  }

  const event = parseRazorpayWebhook(parsed);
  if (!event) {
    return { ok: false, code: "INVALID", message: "Webhook body was not a Razorpay event." };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      await tx.webhookEvent.create({
        data: {
          provider: "razorpay",
          externalEventId: input.externalEventId,
          payload: input.rawBody,
        },
      });

      const applied = isSubscriptionEvent(event.event)
        ? await applySubscriptionEvent(tx, event.event, event.subscription)
        : false;

      await tx.webhookEvent.update({
        where: {
          provider_externalEventId: {
            provider: "razorpay",
            externalEventId: input.externalEventId,
          },
        },
        data: { processedAt: new Date() },
      });

      return applied;
    });

    return { ok: true, applied: result, duplicate: false };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { ok: true, applied: false, duplicate: true };
    }
    throw error;
  }
}

async function applySubscriptionEvent(
  tx: Prisma.TransactionClient,
  event: string,
  providerSubscription: RazorpaySubscription | null,
): Promise<boolean> {
  if (!providerSubscription) return false;

  const nextStatus = localStatus(event);
  if (!nextStatus) return false;

  // Razorpay can report a cancellation that was requested for the end of the
  // period. Keep the paid plan active until the period actually ends.
  const cancelingAtPeriodEnd =
    nextStatus === "CANCELED" &&
    providerSubscription.cancelAtCycleEnd &&
    providerSubscription.currentEnd !== null &&
    providerSubscription.currentEnd.getTime() > Date.now();
  const effectiveStatus = cancelingAtPeriodEnd ? "ACTIVE" : nextStatus;

  const notes = providerSubscription.notes;
  const workspaceId = notes.workspaceId;
  if (!workspaceId) return false;

  const workspace = await tx.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!workspace) return false;

  let planId: string | null = notes.planId ?? null;
  if (planId) {
    const plan = await tx.plan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!plan) planId = null;
  }
  if (!planId && providerSubscription.planId) {
    const price = await tx.planProviderPrice.findUnique({
      where: {
        provider_externalPlanId: {
          provider: "razorpay",
          externalPlanId: providerSubscription.planId,
        },
      },
      select: { planId: true },
    });
    planId = price?.planId ?? null;
  }

  const freePlan =
    effectiveStatus === "CANCELED"
      ? await tx.plan.findUnique({ where: { key: FREE_PLAN_KEY }, select: { id: true } })
      : null;

  const effectivePlanId = effectiveStatus === "CANCELED" ? freePlan?.id : planId;
  if (effectiveStatus !== "CANCELED" && !effectivePlanId) return false;

  const interval = effectiveStatus === "CANCELED" ? null : (notes.interval ?? null);

  await tx.subscription.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      planId: effectivePlanId ?? (await requireFreePlanId(tx)),
      status: effectiveStatus,
      provider: "razorpay",
      providerSubscriptionId: providerSubscription.id,
      providerCustomerId: providerSubscription.customerId,
      interval,
      currentPeriodStart: providerSubscription.currentStart,
      currentPeriodEnd: providerSubscription.currentEnd,
      cancelAtPeriodEnd: providerSubscription.cancelAtCycleEnd,
    },
    update: {
      ...(effectivePlanId ? { planId: effectivePlanId } : {}),
      status: effectiveStatus,
      provider: "razorpay",
      providerSubscriptionId: providerSubscription.id,
      providerCustomerId: providerSubscription.customerId,
      interval,
      currentPeriodStart: providerSubscription.currentStart ?? undefined,
      currentPeriodEnd: providerSubscription.currentEnd ?? undefined,
      cancelAtPeriodEnd: providerSubscription.cancelAtCycleEnd,
    },
  });

  await tx.auditLog.create({
    data: {
      workspaceId,
      actorId: null,
      action: "billing.webhook_applied",
      entityType: "Subscription",
      entityId: providerSubscription.id,
      metadata: JSON.stringify({
        event,
        status: effectiveStatus,
        planId: effectivePlanId ?? null,
        interval,
      }),
    },
  });

  return true;
}

async function requireFreePlanId(tx: Prisma.TransactionClient): Promise<string> {
  const freePlan = await tx.plan.findUnique({
    where: { key: FREE_PLAN_KEY },
    select: { id: true },
  });
  if (!freePlan) {
    throw new Error("Free plan is missing. Run the database seed before processing billing.");
  }
  return freePlan.id;
}
