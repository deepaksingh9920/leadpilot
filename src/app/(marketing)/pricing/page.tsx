import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";

import { PricingTable } from "@/components/marketing/pricing-table";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getPublicPlans } from "@/server/services/marketing";

export const metadata = {
  title: "Pricing",
  description:
    "Free, Starter, Professional, and Agency plans for evidence-first AI prospecting. Limits enforced by the platform.",
};

export const dynamic = "force-dynamic";

const METRICS = [
  { key: "leads_per_month", label: "Sourced leads per month" },
  { key: "agent_runs_per_month", label: "Agent runs per month" },
  { key: "seats", label: "Team seats" },
  { key: "workspaces", label: "Client workspaces" },
  { key: "sends_per_day", label: "Approved sends per day" },
  { key: "exports_per_month", label: "Lead exports per month" },
];

const included = [
  "Source attribution on every lead",
  "Field-level verification status",
  "Human approval before any send",
  "Suppression list enforcement",
  "Audit logs and usage indicators",
  "Role-based access control",
];

const faqs = [
  {
    question: "Can I change plans later?",
    answer:
      "Yes. Upgrades and downgrades are designed to take effect at the start of the next billing period. Plan limits are enforced from the database, so the app reflects the new limits immediately.",
  },
  {
    question: "What counts as an agent run?",
    answer:
      "One run is one execution of a specialist agent — for example, researching one company or qualifying a batch. Discovery runs may consume more than one credit depending on the agent definition shown in the app.",
  },
  {
    question: "Do you provide lead data?",
    answer:
      "Lead data comes only from permitted sources: contracted provider APIs, licensed datasets, or files you import yourself. LeadPilot does not scrape the web or bundle a scraped contact database.",
  },
  {
    question: "Is email sending included?",
    answer:
      "Email delivery requires a configured provider in your environment. When it is not configured, the app clearly reports that status and approved messages remain queued rather than being simulated.",
  },
  {
    question: "What happens when I hit a limit?",
    answer:
      "The action is blocked before it consumes anything, with a message explaining which limit was reached and when it resets. Existing leads and drafts remain accessible.",
  },
];

export default async function PricingPage() {
  const plans = await getPublicPlans();

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden="true" className="absolute inset-0 grid-bg opacity-35" />
        <div className="container-page relative py-16 text-center sm:py-20">
          <Badge tone="brand" className="mb-4">
            Transparent limits, enforced in the app
          </Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Pricing that scales with the work, not the promises.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-[17px]">
            Every plan includes the evidence trail, approval gate, suppression checks, and
            audit logs. Higher plans add capacity and specialist agents.
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container-page">
          <PricingTable plans={plans} />

          <Alert tone="info" className="mx-auto mt-10 max-w-3xl">
            Checkout is not connected in this build yet. Signing up creates a Free workspace
            immediately; paid plan changes will require a configured billing provider and are
            handled in the billing phase.
          </Alert>
        </div>
      </section>

      <section className="border-y border-line bg-surface py-16">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="eyebrow">Compare</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink">
              What each plan includes
            </h2>
          </div>

          <div className="mt-8 overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                    Capability
                  </th>
                  {plans.map((plan) => (
                    <th
                      key={plan.id}
                      className="px-4 py-3 text-center text-sm font-semibold text-ink"
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((metric) => (
                  <tr key={metric.key} className="border-b border-line/70">
                    <th className="py-3 pr-4 text-[13px] font-medium text-ink-soft">
                      {metric.label}
                    </th>
                    {plans.map((plan) => (
                      <td key={plan.id} className="px-4 py-3 text-center text-[13px] text-muted">
                        {plan.limits[metric.key]?.toLocaleString() ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
                {included.map((feature) => (
                  <tr key={feature} className="border-b border-line/70">
                    <th className="py-3 pr-4 text-[13px] font-medium text-ink-soft">
                      {feature}
                    </th>
                    {plans.map((plan) => (
                      <td key={plan.id} className="px-4 py-3 text-center">
                        <Check
                          className="mx-auto size-4 text-success"
                          aria-label="Included"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-b border-line/70">
                  <th className="py-3 pr-4 text-[13px] font-medium text-ink-soft">
                    Approval-gated outreach agents
                  </th>
                  {plans.map((plan) => (
                    <td key={plan.id} className="px-4 py-3 text-center">
                      {plan.key === "free" ? (
                        <Minus className="mx-auto size-4 text-muted" aria-label="Not included" />
                      ) : (
                        <Check
                          className="mx-auto size-4 text-success"
                          aria-label="Included"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container-page grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="eyebrow">Questions</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink">
              Straight answers about the limits.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              If something is not connected yet, the app says so. That applies to pricing
              too — no fake checkout.
            </p>
            <Link
              href="/signup"
              className={buttonClasses({ className: "mt-6" })}
            >
              Start on Free
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {faqs.map((faq) => (
              <details key={faq.question} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-ink">
                  {faq.question}
                  <span className="text-lg leading-none text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-ink py-14 text-center text-white">
        <div className="container-page">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">
            Try the workflow before paying for capacity.
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-white/65">
            The Free plan includes the full evidence, approval, and audit experience with
            tight usage limits.
          </p>
          <Link
            href="/signup"
            className={buttonClasses({
              size: "lg",
              className: "mt-6 bg-white text-ink hover:bg-white/90",
            })}
          >
            Create your workspace
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
