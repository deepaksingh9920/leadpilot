import Link from "next/link";
import {
  CreditCard,
  Database,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { IntegrationCredentialsForm } from "@/components/integrations/credentials-form";
import { RemoveIntegrationButton } from "@/components/integrations/remove-credentials";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/auth/workspace";
import { canManageIntegrations } from "@/lib/auth/roles";
import { env } from "@/lib/env";
import { PROVIDER_LABELS, PROVIDER_TERMS_URLS } from "@/lib/providers/types";
import {
  getIntegrationOverview,
  type ReadResult,
} from "@/server/services/integrations";
import { getActiveLeadSource } from "@/server/services/lead-sources";

export const metadata = { title: "Integrations" };

type StatusTone = "success" | "warning" | "neutral" | "outline";

type Status = {
  tone: StatusTone;
  label: string;
  detail: string | null;
  hasStored: boolean;
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(value);
}

function storedStatus(
  read: ReadResult<unknown>,
  fallbackConfigured: boolean,
): Status {
  if (read.state === "ok") {
    return {
      tone: "success",
      label: "Workspace key",
      detail: `Saved ${formatDate(read.updatedAt)}${
        read.accountLabel ? ` · ${read.accountLabel}` : ""
      }`,
      hasStored: true,
    };
  }
  if (read.state === "error") {
    return {
      tone: "warning",
      label: "Needs attention",
      detail: read.message,
      hasStored: true,
    };
  }
  if (fallbackConfigured) {
    return {
      tone: "outline",
      label: "Server default",
      detail: "Using the deployment's environment variables.",
      hasStored: false,
    };
  }
  return { tone: "neutral", label: "Not configured", detail: null, hasStored: false };
}

export default async function IntegrationsPage() {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const [overview, activeSource] = await Promise.all([
    getIntegrationOverview(context.workspace.id),
    getActiveLeadSource(context.workspace.id),
  ]);

  const canManage = canManageIntegrations(context.role);
  const encryptionReady = overview.encryptionConfigured;

  const aiStatus = storedStatus(overview.ai, env.aiConfigured);
  const leadStatus = storedStatus(
    overview.leadSource,
    env.leadSourceConfigured,
  );
  const emailStatus = storedStatus(overview.email, env.emailConfigured);

  const configuredCount = [aiStatus, leadStatus, emailStatus].filter(
    (status) => status.label === "Workspace key" || status.label === "Server default",
  ).length;

  const aiDefaults =
    overview.ai.state === "ok"
      ? {
          model: overview.ai.credentials.model,
          baseUrl: overview.ai.credentials.baseUrl,
        }
      : { model: env.aiModel, baseUrl: undefined };

  const leadDefaults = {
    leadSource:
      overview.leadSource.state === "ok"
        ? overview.leadSource.credentials.provider
        : env.primaryLeadSource === "apollo" ||
            env.primaryLeadSource === "pdl" ||
            env.primaryLeadSource === "google_places"
          ? env.primaryLeadSource
          : ("apollo" as const),
    baseUrl:
      overview.leadSource.state === "ok"
        ? overview.leadSource.credentials.baseUrl
        : undefined,
  };

  const emailDefaults =
    overview.email.state === "ok"
      ? {
          from: overview.email.credentials.from,
          replyTo: overview.email.credentials.replyTo,
        }
      : { from: env.emailFrom, replyTo: env.emailReplyTo };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            Integrations
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Add your own provider keys here. They are stored encrypted for this workspace
            and never shown again. Deployment environment variables are used only when a
            workspace has not saved its own key.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={configuredCount > 0 ? "success" : "warning"}>
            {configuredCount} of 3 configured
          </Badge>
        </div>
      </div>

      {!encryptionReady ? (
        <Alert tone="warning" title="Credential storage is not enabled on this deployment">
          An operator must set <code>INTEGRATION_ENCRYPTION_KEY</code> (at least 32
          characters) in the server environment and redeploy. Generate one with{" "}
          <code>node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64url&apos;))&quot;</code>
          . Until then, saved keys cannot be encrypted or read, and the forms stay disabled.
        </Alert>
      ) : null}

      {!canManage ? (
        <Alert tone="info" title="Read-only for your role">
          Ask a workspace owner or admin to add or replace provider credentials. You can still
          see which integrations are active.
        </Alert>
      ) : null}

      {canManage && encryptionReady ? (
        <Alert tone="info" title="How saved keys behave">
          A workspace key overrides the deployment default for that provider. Removing it
          restores the default. Keys are write-only: LeadPilot never sends a stored value back
          to the browser. Account emails (verification, password reset, invitations) still use
          the deployment sender.
        </Alert>
      ) : null}

      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Active discovery source
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">
              {activeSource.ok ? activeSource.source.label : "Not configured"}
            </p>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">
              {activeSource.ok
                ? activeSource.source.credentialSource === "workspace"
                  ? "Using this workspace's saved key. Lead Finder sends your ICP filters to this provider and stores only the fields it returns, with source and retrieval metadata."
                  : "Using the deployment's environment configuration. Save a workspace key below to use your own provider account instead."
                : activeSource.message}
            </p>
            {activeSource.ok ? (
              <a
                href={activeSource.source.termsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-[11px] font-semibold text-brand hover:text-brand-dark"
              >
                Provider terms
              </a>
            ) : null}
          </div>
          <Badge tone={activeSource.ok ? "success" : "warning"}>
            {activeSource.ok ? "Ready" : "Unavailable"}
          </Badge>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Sparkles className="size-4 text-brand" aria-hidden="true" />
                AI provider
              </span>
            }
            description="Powers research summaries, qualification reasons, and outreach drafts. Any OpenAI-compatible endpoint works."
            action={<Badge tone={aiStatus.tone}>{aiStatus.label}</Badge>}
          />

          <div className="px-5 py-4">
            <p className="text-[13px] font-semibold text-ink">OpenAI-compatible API</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Model calls are made server-side with your saved key. Set{" "}
              <code>AI_TIMEOUT_MS</code> and <code>AI_MAX_OUTPUT_TOKENS</code> in the
              deployment environment to control cost and latency.
            </p>
            {aiStatus.detail ? (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
                {aiStatus.detail}
              </p>
            ) : null}

            {canManage && encryptionReady ? (
              <>
                <IntegrationCredentialsForm
                  provider="AI"
                  hasStored={aiStatus.hasStored}
                  defaults={aiDefaults}
                />
                {aiStatus.hasStored ? (
                  <RemoveIntegrationButton provider="AI" label="AI" />
                ) : null}
              </>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Database className="size-4 text-brand" aria-hidden="true" />
                Lead sources
              </span>
            }
            description="Only contracted APIs and licensed datasets. Each source must permit prospecting use."
            action={<Badge tone={leadStatus.tone}>{leadStatus.label}</Badge>}
          />

          <div className="px-5 py-4">
            <p className="text-[13px] font-semibold text-ink">Licensed lead API</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Choose Apollo, People Data Labs, or Google Places. A workspace key takes
              precedence over the deployment default; CSV import stays available either way.
            </p>
            {leadStatus.detail ? (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
                {leadStatus.detail}
              </p>
            ) : null}

            {overview.leadSource.state === "ok" ? (
              <a
                href={PROVIDER_TERMS_URLS[overview.leadSource.credentials.provider]}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-[11px] font-semibold text-brand hover:text-brand-dark"
              >
                Data-use terms for{" "}
                {PROVIDER_LABELS[overview.leadSource.credentials.provider]}
              </a>
            ) : null}

            {canManage && encryptionReady ? (
              <>
                <IntegrationCredentialsForm
                  provider="LEAD_SOURCE"
                  hasStored={leadStatus.hasStored}
                  defaults={leadDefaults}
                />
                {leadStatus.hasStored ? (
                  <RemoveIntegrationButton provider="LEAD_SOURCE" label="lead-source" />
                ) : null}
              </>
            ) : null}
          </div>

          <div className="border-t border-line px-5 py-3">
            <p className="text-[11px] leading-relaxed text-muted">
              Already have data you are allowed to use?{" "}
              <Link href="/leads/import" className="font-semibold text-brand">
                Import a CSV
              </Link>{" "}
              — no provider key needed.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Mail className="size-4 text-brand" aria-hidden="true" />
                Email delivery
              </span>
            }
            description="Approved messages are sent through the configured account. Without one, messages stay queued."
            action={<Badge tone={emailStatus.tone}>{emailStatus.label}</Badge>}
          />

          <div className="px-5 py-4">
            <p className="text-[13px] font-semibold text-ink">Resend</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Transactional delivery with message IDs stored per send. The sender address
              must be on a domain verified in the same Resend account.
            </p>
            {emailStatus.detail ? (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
                {emailStatus.detail}
              </p>
            ) : null}

            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              SMTP is planned but not implemented. Verification, reset, and invitation
              emails use the deployment sender even when a workspace key is saved.
            </p>

            {canManage && encryptionReady ? (
              <>
                <IntegrationCredentialsForm
                  provider="EMAIL"
                  hasStored={emailStatus.hasStored}
                  defaults={emailDefaults}
                />
                {emailStatus.hasStored ? (
                  <RemoveIntegrationButton provider="EMAIL" label="email" />
                ) : null}
              </>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CreditCard className="size-4 text-brand" aria-hidden="true" />
                Billing
              </span>
            }
            description="Subscription checkout and plan changes. Until configured, only the Free plan is created."
            action={
              <Badge tone={env.billingWebhooksConfigured ? "success" : "neutral"}>
                {env.billingWebhooksConfigured ? "Configured" : "Not configured"}
              </Badge>
            }
          />

          <div className="px-5 py-4">
            <p className="text-[13px] font-semibold text-ink">Razorpay</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Billing stays deployment-level: Razorpay verifies a webhook signature before
              the app knows which workspace is involved, so keys and the webhook secret
              cannot be per-workspace.
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              Configure <code>RAZORPAY_KEY_ID</code>, <code>RAZORPAY_KEY_SECRET</code>, and{" "}
              <code>RAZORPAY_WEBHOOK_SECRET</code> in the deployment environment, then map
              monthly/yearly plan IDs in{" "}
              <Link href="/admin" className="font-semibold text-brand">
                Admin → Plans
              </Link>
              .
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-brand" aria-hidden="true" />
              How credentials are stored
            </span>
          }
          action={<Badge tone={encryptionReady ? "success" : "warning"}>
            {encryptionReady ? "AES-256-GCM" : "Storage disabled"}
          </Badge>}
        />

        <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
          <div>
            <p className="text-[12px] font-semibold text-ink">Encrypted at rest</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Credentials are sealed with AES-256-GCM under{" "}
              <code>INTEGRATION_ENCRYPTION_KEY</code>. Ciphertext is bound to the workspace
              and provider, so a copied row cannot be decrypted elsewhere.
            </p>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-ink">Write-only in the UI</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              A saved key is never returned to the browser. The page shows only the
              provider, account label, and save time.
            </p>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-ink">Tenant isolation</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Every read is scoped to the active workspace. Only owners and admins can
              change credentials, and every save or removal is written to the audit log
              without the secret.
            </p>
          </div>
        </div>

        {!encryptionReady ? (
          <div className="flex items-start gap-3 border-t border-line px-5 py-4">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-[11px] leading-relaxed text-muted">
              No stored credentials are used while storage is disabled. The app falls back
              to deployment environment variables, if any.
            </p>
          </div>
        ) : null}
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
