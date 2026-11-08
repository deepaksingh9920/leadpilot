"use client";

import { useActionState } from "react";

import { FormMessage, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form";
import { formatCurrency } from "@/lib/utils";
import { cancelSubscriptionAction, startCheckoutAction } from "@/server/actions/billing";

export type CheckoutPlan = {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  intervals: string[];
};

function CheckoutForm({
  plan,
  interval,
  disabled,
}: {
  plan: CheckoutPlan;
  interval: "MONTHLY" | "YEARLY";
  disabled: boolean;
}) {
  const [state, formAction] = useActionState(startCheckoutAction, initialFormState);
  const price = interval === "MONTHLY" ? plan.monthlyPrice : plan.yearlyPrice;

  return (
    <form action={formAction} className="space-y-1.5">
      <input type="hidden" name="planId" value={plan.id} />
      <input type="hidden" name="interval" value={interval} />
      <SubmitButton
        size="sm"
        variant="secondary"
        pendingLabel="Opening Razorpay…"
        disabled={disabled}
        className="w-full justify-between"
      >
        <span>{interval === "MONTHLY" ? "Monthly" : "Yearly"}</span>
        <span className="font-display text-[13px]">
          {price === 0 ? "—" : formatCurrency(price, plan.currency)}
        </span>
      </SubmitButton>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export function BillingCheckoutOptions({
  plans,
  disabled,
}: {
  plans: CheckoutPlan[];
  disabled: boolean;
}) {
  if (plans.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-canvas/60 px-3.5 py-3 text-[11px] leading-relaxed text-muted">
        No paid plan has a Razorpay price mapped yet. A platform admin can add monthly and
        yearly plan IDs in the admin console.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {plans.map((plan) => (
        <div key={plan.id} className="rounded-xl border border-line bg-canvas/60 px-3.5 py-3">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-semibold text-ink">{plan.name}</p>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
              Razorpay checkout
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {plan.intervals.includes("MONTHLY") ? (
              <CheckoutForm plan={plan} interval="MONTHLY" disabled={disabled} />
            ) : null}
            {plan.intervals.includes("YEARLY") ? (
              <CheckoutForm plan={plan} interval="YEARLY" disabled={disabled} />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CancelSubscriptionForm({
  cancelsAtPeriodEnd,
}: {
  cancelsAtPeriodEnd: boolean;
}) {
  const [state, formAction] = useActionState(cancelSubscriptionAction, initialFormState);

  if (cancelsAtPeriodEnd) {
    return (
      <p className="rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-3 text-[11px] leading-relaxed text-ink-soft">
        This subscription is set to cancel at the end of the paid period. Access continues
        until then; no further payments are collected.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <Select
        name="atCycleEnd"
        defaultValue="cycle"
        aria-label="When to cancel"
        className="text-[12px]"
      >
        <option value="cycle">Cancel at the end of the paid period</option>
        <option value="now">Cancel immediately</option>
      </Select>
      <SubmitButton size="sm" variant="secondary" pendingLabel="Canceling…">
        Cancel subscription
      </SubmitButton>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
