import "server-only";

import { env } from "@/lib/env";
import { readEmailIntegration } from "@/server/services/integrations";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Defaults to EMAIL_FROM or the workspace's stored sender. */
  from?: string;
  /** Defaults to the stored reply-to or EMAIL_REPLY_TO. */
  replyTo?: string;
  /** Uses the workspace's stored Resend credentials when present. */
  workspaceId?: string;
  /** Reuse an already-resolved configuration to avoid a second database read. */
  config?: EmailConfig;
};

export type EmailConfig = {
  apiKey: string;
  from: string;
  replyTo?: string;
};

export type EmailConfigResult =
  | { ok: true; config: EmailConfig; source: "workspace" | "server" }
  | { ok: false; reason: "not_configured" | "error"; message: string };

/** Workspace credentials win; a broken stored record fails closed. */
export async function resolveEmailConfig(workspaceId?: string): Promise<EmailConfigResult> {
  if (workspaceId) {
    const stored = await readEmailIntegration(workspaceId);
    if (stored.state === "error") {
      return { ok: false, reason: "error", message: stored.message };
    }
    if (stored.state === "ok") {
      return {
        ok: true,
        source: "workspace",
        config: {
          apiKey: stored.credentials.apiKey,
          from: stored.credentials.from,
          replyTo: stored.credentials.replyTo,
        },
      };
    }
  }

  if (!env.emailConfigured || !env.resendApiKey || !env.emailFrom) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "Email delivery is not configured. Add a Resend key and sender on the Integrations page, or set RESEND_API_KEY and EMAIL_FROM on the server.",
    };
  }

  return {
    ok: true,
    source: "server",
    config: {
      apiKey: env.resendApiKey,
      from: env.emailFrom,
      replyTo: env.emailReplyTo,
    },
  };
}

export type EmailResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; reason: "not_configured" | "provider_error"; message: string };

export async function sendEmail(input: SendEmailInput): Promise<EmailResult> {
  const resolved = input.config
    ? ({ ok: true, config: input.config } as const)
    : await resolveEmailConfig(input.workspaceId);

  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason === "not_configured" ? "not_configured" : "provider_error",
      message: resolved.message,
    };
  }

  const config = resolved.config;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from ?? config.from,
        to: [input.to],
        reply_to: input.replyTo ?? config.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Email provider rejected a message", {
        status: response.status,
        detail: detail.slice(0, 500),
      });
      return {
        ok: false,
        reason: "provider_error",
        message: "The email provider rejected the message. Check the server logs.",
      };
    }

    return { ok: true, providerMessageId: readMessageId(await response.json().catch(() => null)) };
  } catch (error) {
    console.error("Email delivery failed", error);
    return {
      ok: false,
      reason: "provider_error",
      message: "The email provider could not be reached. Try again shortly.",
    };
  }
}

function readMessageId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function layout(title: string, body: string, footer: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f5f1;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e4dc;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="padding:28px 32px;border-bottom:1px solid #eeece6;">
          <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;">LeadPilot</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px;">Evidence-first prospecting</div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;letter-spacing:-0.02em;">${title}</h1>
          ${body}
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px;border-top:1px solid #eeece6;font-size:12px;color:#6b7280;">
          ${footer}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
): Promise<EmailResult> {
  const url = `${env.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    subject: "Verify your LeadPilot email",
    text: `Hi ${name}, verify your email to finish setting up LeadPilot: ${url}\n\nThis link expires in 24 hours.`,
    html: layout(
      "Verify your email",
      `<p style="margin:0 0 16px;line-height:1.6;">Hi ${escapeHtml(name)},</p>
       <p style="margin:0 0 24px;line-height:1.6;">Confirm this email address to finish setting up your LeadPilot workspace.</p>
       <a href="${url}" style="display:inline-block;background:#4338ca;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Verify email</a>
       <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>`,
      "You received this email because an account was created with this address.",
    ),
  });
}

export async function sendInviteEmail(
  to: string,
  workspaceName: string,
  inviterName: string,
  role: string,
  token: string,
): Promise<EmailResult> {
  const url = `${env.appUrl}/invite/${encodeURIComponent(token)}`;
  const roleLabel = role.charAt(0) + role.slice(1).toLowerCase();
  return sendEmail({
    to,
    subject: `${inviterName} invited you to ${workspaceName} on LeadPilot`,
    text: `Hi,\n\n${inviterName} invited you to join the ${workspaceName} workspace on LeadPilot as ${roleLabel}.\n\nAccept the invitation: ${url}\n\nThis link expires in 7 days. If you were not expecting this invitation, you can ignore this email.`,
    html: layout(
      "You have been invited",
      `<p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(workspaceName)}</strong> on LeadPilot as ${escapeHtml(roleLabel)}.</p>
       <p style="margin:0 0 24px;line-height:1.6;">Accept the invitation to review leads, campaigns, and drafts with the team.</p>
       <a href="${url}" style="display:inline-block;background:#4338ca;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Accept invitation</a>
       <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">This link expires in 7 days. If you were not expecting this invitation, you can ignore this email.</p>`,
      "You received this email because a workspace administrator invited this address.",
    ),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
): Promise<EmailResult> {
  const url = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    subject: "Reset your LeadPilot password",
    text: `Hi ${name}, reset your LeadPilot password: ${url}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
    html: layout(
      "Reset your password",
      `<p style="margin:0 0 16px;line-height:1.6;">Hi ${escapeHtml(name)},</p>
       <p style="margin:0 0 24px;line-height:1.6;">Use the button below to choose a new password. This link expires in one hour.</p>
       <a href="${url}" style="display:inline-block;background:#4338ca;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Choose a new password</a>
       <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">If you did not request a reset, no action is needed.</p>`,
      "For security, LeadPilot staff will never ask for your password.",
    ),
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
