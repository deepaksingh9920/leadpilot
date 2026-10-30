import "server-only";

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export const env = {
  appUrl: optional("APP_URL") ?? "http://localhost:3000",
  isProduction: process.env.NODE_ENV === "production",
  sessionCookieName: optional("SESSION_COOKIE_NAME") ?? "leadpilot_session",
  workspaceCookieName: optional("WORKSPACE_COOKIE_NAME") ?? "leadpilot_workspace",
  emailProvider: optional("EMAIL_PROVIDER") ?? "resend",
  emailFrom: optional("EMAIL_FROM"),
  emailReplyTo: optional("EMAIL_REPLY_TO"),
  aiConfigured: Boolean(optional("AI_API_KEY") && optional("AI_MODEL")),
  leadSourceConfigured: Boolean(
    optional("APOLLO_API_KEY") ||
      optional("PDL_API_KEY") ||
      optional("GOOGLE_PLACES_API_KEY"),
  ),
  emailConfigured: Boolean(optional("RESEND_API_KEY") && optional("EMAIL_FROM")),
  billingConfigured: Boolean(optional("STRIPE_SECRET_KEY")),
  sentryConfigured: Boolean(optional("SENTRY_DSN")),
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
