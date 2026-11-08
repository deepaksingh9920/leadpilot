import "server-only";

import {
  selectLeadSource,
  type LeadSourceSelection,
} from "@/lib/providers/selection";

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function positiveInt(name: string, fallback: number): number {
  const raw = optional(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const aiApiKey = optional("AI_API_KEY");
const aiModel = optional("AI_MODEL");

const leadSourceSelection: LeadSourceSelection = selectLeadSource({
  primary: optional("PRIMARY_LEAD_SOURCE"),
  apolloKey: optional("APOLLO_API_KEY"),
  pdlKey: optional("PDL_API_KEY"),
  googlePlacesKey: optional("GOOGLE_PLACES_API_KEY"),
  apolloTermsUrl: optional("APOLLO_TERMS_URL"),
  pdlTermsUrl: optional("PDL_TERMS_URL"),
  googlePlacesTermsUrl: optional("GOOGLE_PLACES_TERMS_URL"),
});

export const env = {
  appUrl: optional("APP_URL") ?? "http://localhost:3000",
  isProduction: process.env.NODE_ENV === "production",
  sessionCookieName: optional("SESSION_COOKIE_NAME") ?? "leadpilot_session",
  workspaceCookieName: optional("WORKSPACE_COOKIE_NAME") ?? "leadpilot_workspace",
  emailProvider: optional("EMAIL_PROVIDER") ?? "resend",
  emailFrom: optional("EMAIL_FROM"),
  emailReplyTo: optional("EMAIL_REPLY_TO"),

  aiConfigured: Boolean(aiApiKey && aiModel),
  aiApiKey,
  aiModel,
  aiBaseUrl: optional("AI_BASE_URL") ?? "https://api.openai.com/v1",
  aiTimeoutMs: positiveInt("AI_TIMEOUT_MS", 30_000),
  aiMaxOutputTokens: positiveInt("AI_MAX_OUTPUT_TOKENS", 2_000),

  primaryLeadSource: optional("PRIMARY_LEAD_SOURCE")?.toLowerCase(),
  leadSourceSelection,
  leadSourceConfigured: leadSourceSelection.ok,
  apolloApiKey: optional("APOLLO_API_KEY"),
  apolloBaseUrl: optional("APOLLO_API_BASE_URL") ?? "https://api.apollo.io/v1",
  pdlApiKey: optional("PDL_API_KEY"),
  pdlBaseUrl: optional("PDL_API_BASE_URL") ?? "https://api.peopledatalabs.com/v5",
  googlePlacesApiKey: optional("GOOGLE_PLACES_API_KEY"),
  googlePlacesBaseUrl:
    optional("GOOGLE_PLACES_API_BASE_URL") ?? "https://places.googleapis.com/v1",

  emailConfigured: Boolean(optional("RESEND_API_KEY") && optional("EMAIL_FROM")),
  billingProvider: optional("BILLING_PROVIDER")?.toLowerCase() ?? "razorpay",
  razorpayKeyId: optional("RAZORPAY_KEY_ID"),
  razorpayKeySecret: optional("RAZORPAY_KEY_SECRET"),
  razorpayWebhookSecret: optional("RAZORPAY_WEBHOOK_SECRET"),
  razorpayBaseUrl: optional("RAZORPAY_API_BASE_URL") ?? "https://api.razorpay.com/v1",
  billingConfigured: Boolean(optional("RAZORPAY_KEY_ID") && optional("RAZORPAY_KEY_SECRET")),
  billingWebhooksConfigured: Boolean(
    optional("RAZORPAY_KEY_ID") &&
      optional("RAZORPAY_KEY_SECRET") &&
      optional("RAZORPAY_WEBHOOK_SECRET"),
  ),
  sentryConfigured: Boolean(optional("SENTRY_DSN")),
  workerSecret: optional("WORKER_SECRET"),
  agentRuntimeReady: optional("AGENT_RUNTIME_READY") === "true",
  logLevel: optional("LOG_LEVEL") ?? "info",
};

export function requireAuthSecret(): string {
  const secret = optional("AUTH_SECRET");
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a 32+ byte random value in .env.local.",
    );
  }
  return secret;
}
