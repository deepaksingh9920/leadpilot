"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";

export type PublicPlan = {
  id: string;
  key: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  limits: Record<string, number>;
  agentCount: number;
};

const METRIC_COPY: Record<string, (value: number) => string> = {
  leads_per_month: (value) => `${value.toLocaleString()} sourced leads / month`,
  agent_runs_per_month: (value) => `${value.toLocaleString()} agent runs / month`,
  seats: (value) => `${value} team seat${value === 1 ? "" : "s"}`,
  workspaces: (value) => `${value} client workspace${value === 1 ? "" : "s"}`,
  sends_per_day: (value) => `${value} approved sends / day`,
  exports_per_month: (value) => `${value} exports / month`,
};

const ORDER = [
  "leads_per_month",
  "agent_runs_per_month",
  "seats",
  "workspaces",
  "sends_per_day",
  "exports_per_month",
];

export function PricingTable({
  plans,
  compact = false,
}: {
  plans: PublicPlan[];
  compact?: boolean;
}) {
  const [annual, setAnnual] = useState(false);

  return (
    <div>
      <div className="flex flex-col items-center gap-3">
        <div className="inline-flex rounded-full border border-line-strong bg-surface p-1">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              annual ? "text-muted hover:text-ink" : "bg-ink text-white",
            )}
            aria-pressed={!annual}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              annual ? "bg-ink text-white" : "text-muted hover:text-ink",
            )}
            aria-pressed={annual}
          >
            Yearly
            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-accent">
              Save 20%
            </span>
          </button>
        </div>
        <p className="text-xs text-muted">
          Prices in USD. Yearly plans are billed once per year. Change plan any time.
        </p>
      </div>

      <div
        className={cn(
          "mt-8 grid gap-4",
          compact ? "sm:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-4",
        )}
      >
        {plans.map((plan) => {
          const highlighted = plan.key === "professional";
          const cents = annual ? plan.yearlyPrice : plan.monthlyPrice;
          const per = annual ? "/year" : "/month";

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-surface p-5",
                highlighted
                  ? "border-brand/30 shadow-lift ring-1 ring-brand/10"
                  : "border-line shadow-soft",
              )}
            >
              {highlighted ? (
                <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                  <Sparkles className="size-3" aria-hidden="true" />
                  Most popular
                </span>
              ) : null}

              <h3 className="font-display text-lg font-semibold text-ink">{plan.name}</h3>
              <p className="mt-1 min-h-10 text-[13px] leading-relaxed text-muted">
                {plan.description}
              </p>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="font-display text-3xl font-semibold tracking-tight text-ink">
                  {cents === 0 ? "Free" : formatCurrency(cents, plan.currency)}
                </span>
                {cents === 0 ? null : (
                  <span className="text-xs font-medium text-muted">{per}</span>
                )}
              </div>
              {annual && cents > 0 ? (
                <p className="mt-1 text-[11px] text-muted">
                  ≈ {formatCurrency(Math.round(cents / 12), plan.currency)} / month
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted">
                  {plan.agentCount} specialist {plan.agentCount === 1 ? "agent" : "agents"}
                </p>
              )}

              <Link
                href={plan.key === "free" ? "/signup" : `/signup?plan=${plan.key}`}
                className={buttonClasses({
                  variant: highlighted ? "primary" : "secondary",
                  className: "mt-5 w-full",
                })}
              >
                {plan.key === "free" ? "Start free" : `Choose ${plan.name}`}
              </Link>

              <ul className="mt-5 space-y-2.5 border-t border-line pt-4">
                {ORDER.filter((metric) => plan.limits[metric] !== undefined).map((metric) => (
                  <li key={metric} className="flex items-start gap-2 text-[13px] text-ink-soft">
                    <Check
                      className="mt-0.5 size-3.5 shrink-0 text-success"
                      aria-hidden="true"
                    />
                    <span>{METRIC_COPY[metric]?.(plan.limits[metric]) ?? metric}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-muted">
        All plans include source attribution, field-level verification status, audit logs, and
        mandatory human approval before any email is sent. Plan limits are enforced by the
        platform, not just displayed.
      </p>
    </div>
  );
}
