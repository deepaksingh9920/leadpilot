import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  CreditCard,
  Database,
  Mail,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/workspace";
import { env } from "@/lib/env";

export const metadata = { title: "Integrations" };

type ProviderCard = {
  name: string;
  description: string;
  envKeys: string[];
  configured: boolean;
  note: string;
};

export default async function IntegrationsPage() {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const records = await db.integration.findMany({
    where: { workspaceId: context.workspace.id },
    orderBy: { provider: "asc" },
  });

  const groups: { title: string; icon: typeof Bot; blurb: string; providers: ProviderCard[] }[] =
    [
      {
        title: "AI provider",
        icon: Sparkles,
        blurb:
          "Powers research summaries, qualification reasons, and outreach drafts. Any OpenAI-compatible endpoint works.",
        providers: [
          {
            name: "OpenAI-compatible API",
            description: "Model calls are made server-side with your configured key.",
            envKeys: ["AI_API_KEY", "AI_MODEL", "AI_BASE_URL"],
            configured: env.aiConfigured,
            note: "Set AI_TIMEOUT_MS and AI_MAX_OUTPUT_TOKENS to control cost and latency.",
          },
        ],
      },
      {
        title: "Lead sources",
        icon: Database,
        blurb:
          "Only contracted APIs and licensed datasets. Each source must permit prospecting use.",
        providers: [
          {
            name: "Apollo",
            description: "Company and contact search through Apollo's licensed API.",
            envKeys: ["APOLLO_API_KEY"],
            configured: Boolean(process.env.APOLLO_API_KEY),
            note: "Review your Apollo plan's data-use terms before enabling outreach.",
          },
          {
            name: "People Data Labs",
            description: "Company enrichment from a licensed dataset.",
            envKeys: ["PDL_API_KEY"],
            configured: Boolean(process.env.PDL_API_KEY),
            note: "Records keep the PDL dataset reference and retrieval timestamp.",
          },
          {
            name: "Google Places",
            description: "Business listings for local and regional prospecting.",
            envKeys: ["GOOGLE_PLACES_API_KEY"],
            configured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
            note: "Place details must be cached according to Google's terms.",
          },
          {
            name: "CSV import",
            description: "Import data you already have the right to use.",
            envKeys: [],
            configured: false,
            note: "Import and field mapping are part of a later phase. No import button is shown until it works.",
          },
        ],
      },
      {
        title: "Email delivery",
        icon: Mail,
        blurb:
          "Approved messages are sent through a configured provider. Without one, messages stay queued.",
        providers: [
          {
            name: "Resend",
            description: "Transactional delivery API with message IDs stored per send.",
            envKeys: ["RESEND_API_KEY", "EMAIL_FROM"],
            configured: env.emailConfigured,
            note: "Verification and password-reset emails also use this provider.",
          },
          {
            name: "SMTP",
            description: "Bring your own SMTP relay.",
            envKeys: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"],
            configured: false,
            note: "The SMTP adapter is planned. The Resend adapter is the implemented path.",
          },
        ],
      },
      {
        title: "Billing",
        icon: CreditCard,
        blurb:
          "Subscription checkout and plan changes. Until configured, only the Free plan is created.",
        providers: [
          {
            name: "Stripe",
            description: "Subscription billing and webhook-driven plan updates.",
            envKeys: [
              "STRIPE_SECRET_KEY",
              "STRIPE_WEBHOOK_SECRET",
              "STRIPE_PRICE_STARTER_MONTHLY",
            ],
            configured: env.billingConfigured,
            note: "Checkout is not exposed in this build. Plan records and limits are ready.",
          },
        ],
      },
    ];

  const configuredCount = groups
    .flatMap((group) => group.providers)
    .filter((provider) => provider.configured).length;
  const totalCount = groups.flatMap((group) => group.providers).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            Integrations
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Provider credentials are configured server-side by the workspace operator. Status
            below reflects the actual environment — nothing is simulated.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={configuredCount > 0 ? "success" : "warning"}>
            {configuredCount} of {totalCount} configured
          </Badge>
        </div>
      </div>

      <Alert tone="info" title="How configuration works in this build">
        LeadPilot reads provider credentials from the server environment (for example,
        <code className="mx-1 rounded bg-white/60 px-1 py-0.5 text-[11px]">
          APOLLO_API_KEY
        </code>
        ). Encrypted per-workspace credentials arrive with the integration phase. Until a
        provider is configured, its features report as unavailable instead of falling back to
        demo data.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.title}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <group.icon className="size-4 text-brand" aria-hidden="true" />
                  {group.title}
                </span>
              }
              description={group.blurb}
            />
            <ul className="divide-y divide-line">
              {group.providers.map((provider) => (
                <li key={provider.name} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink">{provider.name}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                        {provider.description}
                      </p>
                    </div>
                    {provider.configured ? (
                      <Badge tone="success">
                        <CheckCircle2 className="size-3" aria-hidden="true" />
                        Configured
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Not configured</Badge>
                    )}
                  </div>

                  {provider.envKeys.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {provider.envKeys.map((key) => (
                        <code
                          key={key}
                          className="rounded-md bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-ink-soft ring-1 ring-line"
                        >
                          {key}
                        </code>
                      ))}
                    </div>
                  ) : null}

                  <p className="mt-2 text-[10px] leading-relaxed text-muted">{provider.note}</p>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Workspace connection records"
          description="Stored per-workspace integration state, separate from server credentials."
          action={<Badge tone="outline">{records.length} records</Badge>}
        />
        {records.length === 0 ? (
          <div className="flex items-start gap-3 px-5 py-6">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-semibold text-ink">No connections on file</p>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">
                An integration record is created only after credentials are validated and
                stored. Because no provider is configured in this environment, no records
                exist. Connected accounts will show their label, last check time, and any
                error here.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {records.map((record) => (
              <li key={record.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-ink">{record.provider}</p>
                  <p className="text-[11px] text-muted">
                    {record.accountLabel ?? "No account label"}
                  </p>
                </div>
                <Badge tone={record.status === "ACTIVE" ? "success" : "neutral"}>
                  {record.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-sm font-semibold text-ink">Data-source policy</h2>
        <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-muted">
          Every source must be authorized for prospecting. LeadPilot stores the source name,
          license note, and terms URL alongside the leads it produces, and never scrapes
          websites or social profiles. If you are unsure whether a provider permits your use
          case, resolve that before connecting it.
        </p>
        <Link
          href="/features#security"
          className="mt-3 inline-flex text-xs font-semibold text-brand hover:text-brand-dark"
        >
          Read the security model
        </Link>
      </Card>
    </div>
  );
}
