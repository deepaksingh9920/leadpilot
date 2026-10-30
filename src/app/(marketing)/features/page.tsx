import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  Check,
  ClipboardCheck,
  Database,
  FileSearch,
  Gauge,
  KeyRound,
  Mail,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";

import { AgentsGrid } from "@/components/marketing/agents-grid";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getActiveAgents } from "@/server/services/marketing";

export const metadata = {
  title: "Product and agent team",
  description:
    "How LeadPilot discovers, researches, qualifies, and drafts outreach — with source attribution and human approval at every send.",
};

export const dynamic = "force-dynamic";

const pipeline = [
  {
    stage: "Discover",
    agent: "Lead Finder",
    output: "Companies that match your profile, each with source and retrieval date.",
    guardrail: "Permitted sources only. No scraping, no purchased contact dumps.",
  },
  {
    stage: "Research",
    agent: "Company Research",
    output: "A grounded summary of services, positioning, and likely needs.",
    guardrail: "Summaries cite retrieved pages. Missing evidence stays missing.",
  },
  {
    stage: "Qualify",
    agent: "Lead Qualification",
    output: "A fit score with explicit reasons and a data-confidence level.",
    guardrail: "Scores are explainable. No hidden model magic in the ranking.",
  },
  {
    stage: "Draft",
    agent: "Email Outreach",
    output: "Personalized email drafts using only stored, verified lead fields.",
    guardrail: "Drafts cannot send. An admin must approve the exact message.",
  },
];

const securityPillars = [
  {
    icon: Database,
    title: "Authorized data sources",
    body: "LeadPilot only accepts data from contracted APIs, licensed datasets, or files you import yourself. Source terms and license notes are stored with each source.",
  },
  {
    icon: FileSearch,
    title: "Evidence retention",
    body: "Source URLs, retrieval timestamps, and field-level verification records stay attached to the lead so any claim can be traced back.",
  },
  {
    icon: ClipboardCheck,
    title: "Human approval before send",
    body: "Outreach moves through draft, approved, scheduled, and sent states. The transition to approved requires an admin or owner.",
  },
  {
    icon: Ban,
    title: "Suppression and rate limits",
    body: "Unsubscribes, bounces, and complaints feed a workspace suppression list. Daily send caps and per-endpoint rate limits are enforced server-side.",
  },
  {
    icon: KeyRound,
    title: "Tenant isolation and RBAC",
    body: "Every query is scoped to a workspace. Viewers, members, admins, and owners have distinct permissions, checked in the data layer.",
  },
  {
    icon: ScrollText,
    title: "Audit logs",
    body: "Logins, profile changes, approvals, sends, exports, and billing events are recorded with actor, workspace, timestamp, and context.",
  },
];

const notAllowed = [
  "Scraping search results, social profiles, or websites",
  "Inventing emails, phone numbers, or company facts",
  "Sending without an explicit human approval",
  "Emailing addresses on the suppression list",
  "Sharing one workspace's data with another tenant",
];

export default async function FeaturesPage() {
  const agents = await getActiveAgents();

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden="true" className="absolute inset-0 grid-bg opacity-35" />
        <div className="container-page relative py-16 sm:py-20">
          <Badge tone="brand" className="mb-4">
            <Gauge className="size-3" aria-hidden="true" />
            Product overview
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            A prospecting workflow you can inspect at every step.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-[17px]">
            LeadPilot separates discovery, research, qualification, and outreach into
            specialist agents. Each stage leaves an artifact you can review — and the final
            send always waits for a person.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className={buttonClasses({ size: "lg" })}>
              Start free
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/pricing"
              className={buttonClasses({ variant: "secondary", size: "lg" })}
            >
              View pricing
            </Link>
          </div>

          <Alert tone="warning" title="Current build status" className="mt-8 max-w-3xl">
            This deployment currently includes the workspace, authentication, onboarding,
            admin configuration, and the product UI. Live agent execution, lead-source
            connections, and email delivery are enabled in later phases and will report their
            real connection status inside the app. No demo leads or placeholder outreach are
            created.
          </Alert>
        </div>
      </section>

      <section className="border-b border-line bg-surface py-16 sm:py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="eyebrow">The pipeline</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
              Four stages. Four accountable outputs.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {pipeline.map((item, index) => (
              <div
                key={item.stage}
                className="rounded-2xl border border-line bg-canvas/60 p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                    Step {index + 1} · {item.stage}
                  </span>
                  <Badge tone="outline">{item.agent}</Badge>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{item.output}</p>
                <div className="mt-4 flex items-start gap-2 border-t border-line pt-3">
                  <ShieldCheck
                    className="mt-0.5 size-3.5 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  <p className="text-xs leading-relaxed text-muted">{item.guardrail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="agents" className="border-b border-line py-16 sm:py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="eyebrow">Agent team</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
              Meet the specialists.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Every agent has a narrow job, an explicit cost, and a rule for when a human must
              step in. Availability depends on your plan.
            </p>
          </div>
          <div className="mt-8">
            <AgentsGrid agents={agents} />
          </div>
        </div>
      </section>

      <section id="security" className="border-b border-line bg-surface py-16 sm:py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="eyebrow">Security and compliance</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
              Guardrails are the product.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Outbound prospecting carries legal and reputational risk. LeadPilot treats the
              controls as first-class features, not optional add-ons.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {securityPillars.map((pillar) => (
              <div
                key={pillar.title}
                className="rounded-2xl border border-line bg-canvas/50 p-5"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-brand ring-1 ring-line">
                  <pillar.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3 font-display text-base font-semibold text-ink">
                  {pillar.title}
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{pillar.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-success/20 bg-success-soft p-6">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold text-success">
                <Check className="size-4" aria-hidden="true" />
                Always allowed
              </h3>
              <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-success">
                <li>Contracted lead-source APIs and licensed datasets</li>
                <li>CSV imports of data you already have the right to use</li>
                <li>Manual research notes with a source URL and timestamp</li>
                <li>Human-approved outreach within daily caps</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-danger/20 bg-danger-soft p-6">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold text-danger">
                <Ban className="size-4" aria-hidden="true" />
                Never allowed
              </h3>
              <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-danger">
                {notAllowed.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-line py-16 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="eyebrow">Designed for teams</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
              Clear roles, clean handoffs, no shared passwords.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Invite teammates with the access they need. Approval rights stay with admins
              and owners; billing stays with the owner. Every action is attributable.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                {
                  icon: Users,
                  label: "Viewer",
                  body: "Read-only access to leads, campaigns, and reports.",
                },
                {
                  icon: FileSearch,
                  label: "Member",
                  body: "Import leads, run research, build campaigns, draft messages.",
                },
                {
                  icon: BadgeCheck,
                  label: "Admin",
                  body: "Approve outreach, manage agents and integrations, invite the team.",
                },
                {
                  icon: KeyRound,
                  label: "Owner",
                  body: "Billing, workspace deletion, and full administrative control.",
                },
              ].map((role) => (
                <li key={role.label} className="flex gap-3">
                  <role.icon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-ink">{role.label}</p>
                    <p className="text-[13px] leading-relaxed text-muted">{role.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 border-b border-line pb-4">
              <Mail className="size-4 text-brand" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold text-ink">
                The approval rule
              </h3>
            </div>
            <ol className="mt-5 space-y-4">
              {[
                "An agent drafts a message using stored lead fields only.",
                "The draft is checked against the suppression list and daily cap.",
                "An admin reviews the exact subject and body.",
                "Approval records the approver and timestamp.",
                "Only then can a configured email provider send it.",
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-dark">
                    {index + 1}
                  </span>
                  <p className="text-[13px] leading-relaxed text-ink-soft">{step}</p>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-xl bg-canvas px-4 py-3 text-xs leading-relaxed text-muted">
              If an email provider is not configured, approved messages stay queued and the
              app says so plainly. Nothing is simulated.
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="container-page text-center">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold text-ink sm:text-4xl">
            See the whole workflow with your own market.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            Create a workspace, complete the onboarding profile, and explore the dashboard.
            The free plan is enough to evaluate the experience.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={buttonClasses({ size: "lg" })}>
              Create your workspace
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/pricing"
              className={buttonClasses({ variant: "secondary", size: "lg" })}
            >
              Compare plans
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
