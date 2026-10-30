import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Database,
  FileSearch,
  Fingerprint,
  Lock,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";

import { AgentsGrid } from "@/components/marketing/agents-grid";
import { ProductPreview } from "@/components/marketing/product-preview";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getActiveAgents, getPublicPlans } from "@/server/services/marketing";

export const metadata = {
  title: "LeadPilot — Evidence-first AI prospecting",
  description:
    "Specialist AI agents find real businesses, research them, score fit, and draft outreach you approve. Every field stays tied to its source.",
};

export const dynamic = "force-dynamic";

const promiseCards = [
  {
    icon: FileSearch,
    title: "Evidence, not guesswork",
    body: "Every company, contact, and source page is stored with the lead. If a field has no evidence, it stays blank instead of being invented.",
  },
  {
    icon: Workflow,
    title: "Agents with narrow jobs",
    body: "Finding, researching, qualifying, and drafting are separate agents. Each one shows its status, inputs, and what it actually produced.",
  },
  {
    icon: Lock,
    title: "You keep the keys",
    body: "Nothing is sent without a human approval on the exact draft. Suppression lists, rate limits, and audit logs are built into the workflow.",
  },
];

const trustPoints = [
  { icon: Database, label: "Permitted sources only" },
  { icon: BadgeCheck, label: "Field-level verification" },
  { icon: ClipboardCheck, label: "Approval before send" },
  { icon: ScrollText, label: "Full audit trail" },
];

const steps = [
  {
    number: "01",
    title: "Describe your market",
    body: "Set your industry, regions, company size, budget, and what makes a good fit. No prompt engineering required.",
  },
  {
    number: "02",
    title: "Agents discover and research",
    body: "The Lead Finder collects companies from permitted sources. The Research agent reads and summarizes, keeping its sources attached.",
  },
  {
    number: "03",
    title: "Qualification explains itself",
    body: "Every score comes with reasons and a confidence level, so you can see exactly why a prospect ranks where it does.",
  },
  {
    number: "04",
    title: "You approve the outreach",
    body: "Drafts arrive with the evidence beside them. Review, edit, approve — but only you can release a message.",
  },
];

export default async function LandingPage() {
  const [plans, agents] = await Promise.all([getPublicPlans(), getActiveAgents()]);

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden="true" className="absolute inset-0 grid-bg opacity-40" />
        <div
          aria-hidden="true"
          className="absolute -right-40 -top-32 size-[32rem] rounded-full bg-brand/10 blur-3xl"
        />
        <div className="container-page relative grid items-center gap-12 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:py-24">
          <div>
            <Badge tone="brand" className="mb-5">
              <Sparkles className="size-3" aria-hidden="true" />
              Evidence-first prospecting
            </Badge>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl lg:text-[3.4rem]">
              Your next customers.
              <span className="block text-brand">With the receipts.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-[17px]">
              LeadPilot&apos;s specialist agents find real businesses, research them, score
              fit, and draft outreach — while keeping every field tied to a permitted source
              and every send behind your approval.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className={buttonClasses({ size: "lg" })}>
                Start free
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/features"
                className={buttonClasses({ variant: "secondary", size: "lg" })}
              >
                See how it works
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted">
              Free plan available. No credit card required. Human approval stays mandatory.
            </p>

            <dl className="mt-10 grid max-w-lg grid-cols-2 gap-4 border-t border-line pt-6 sm:grid-cols-4">
              {trustPoints.map((point) => (
                <div key={point.label}>
                  <point.icon className="size-4 text-brand" aria-hidden="true" />
                  <dt className="mt-2 text-[11px] font-semibold leading-snug text-ink-soft">
                    {point.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>

          <ProductPreview />
        </div>
      </section>

      <section className="border-b border-line bg-surface py-16 sm:py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="eyebrow">The difference</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
              Most lead tools give you a list. LeadPilot gives you a case file.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Sales teams do not need more unverified rows in a spreadsheet. They need to know
              which companies are worth a conversation, why, and what to say — without
              risking made-up details in an outbound email.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {promiseCards.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-line bg-canvas/60 p-6"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-surface text-brand shadow-sm ring-1 ring-line">
                  <card.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                  {card.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-b border-line py-16 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
              From market definition to approved draft, in four visible steps.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              No black boxes. Each stage has a status, an owner, and an output you can
              inspect before the next stage begins.
            </p>
            <Link
              href="/features"
              className={buttonClasses({ variant: "secondary", className: "mt-6" })}
            >
              Explore the agent team
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <ol className="relative space-y-3">
            {steps.map((step) => (
              <li
                key={step.number}
                className="group flex gap-4 rounded-2xl border border-line bg-surface p-5 shadow-soft"
              >
                <span className="font-display text-sm font-semibold text-brand">
                  {step.number}
                </span>
                <div>
                  <h3 className="font-display text-base font-semibold text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="agents" className="border-b border-line bg-surface py-16 sm:py-20">
        <div className="container-page">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="eyebrow">The agent team</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
                Six specialists. One accountable workflow.
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                Every agent has a defined job, a credit cost, and a clear approval rule.
                Outreach agents can never send on their own.
              </p>
            </div>
            <Link
              href="/features#agents"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              Agent details
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-8">
            <AgentsGrid agents={agents} />
          </div>
        </div>
      </section>

      <section id="security" className="border-b border-line bg-ink py-16 text-white sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-amber-300">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Built for trust
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Compliance is part of the workflow, not a settings page.
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/70">
              LeadPilot is designed around permitted data sources, evidence retention, and
              deliberate human decisions. Sending is gated, suppressed addresses stay
              suppressed, and every sensitive action is recorded.
            </p>
            <Link
              href="/features#security"
              className={buttonClasses({
                variant: "secondary",
                className: "mt-6 border-white/20 bg-white/10 text-white hover:bg-white/15",
              })}
            >
              Read the security model
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                icon: Database,
                title: "Permitted sources",
                body: "Only contracted APIs, licensed datasets, and your own imports. No scraping.",
              },
              {
                icon: Fingerprint,
                title: "Source attribution",
                body: "Each lead remembers where it came from, when, and under which license.",
              },
              {
                icon: Users,
                title: "Role-based access",
                body: "Viewers, members, admins, and owners see and do different things by design.",
              },
              {
                icon: ScrollText,
                title: "Immutable audit trail",
                body: "Approvals, sends, exports, and settings changes are logged with context.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
              >
                <item.icon className="size-5 text-amber-300" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-semibold text-white">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-white/60">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-line py-16 sm:py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
              Start small. Scale the workflow, not the guesswork.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Limits are enforced by the platform. Every plan includes the same evidence,
              approval, and audit foundations.
            </p>
          </div>
          <div className="mt-10">
            <PricingTable plans={plans} compact />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-3xl border border-brand/20 bg-brand px-6 py-12 text-center text-white sm:px-12">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(251,191,36,0.22),transparent_40%)]"
            />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                Build a pipeline you can actually defend.
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-white/75">
                Set up your workspace, define your ideal customer, and see exactly what the
                agents can do with permitted data — before you commit to a plan.
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className={buttonClasses({
                    variant: "secondary",
                    size: "lg",
                    className: "border-transparent bg-white text-brand-dark hover:bg-white/90",
                  })}
                >
                  Start free
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/pricing"
                  className={buttonClasses({
                    variant: "ghost",
                    size: "lg",
                    className: "text-white hover:bg-white/10",
                  })}
                >
                  Compare plans
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
