import "server-only";

import { env } from "@/lib/env";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Defaults to EMAIL_FROM. Must be on a verified sending domain. */
  from?: string;
  /** Defaults to EMAIL_REPLY_TO. */
  replyTo?: string;
};

export type EmailResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; reason: "not_configured" | "provider_error"; message: string };

export async function sendEmail(input: SendEmailInput): Promise<EmailResult> {
  if (!env.emailConfigured) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "Email delivery is not configured. Add RESEND_API_KEY and EMAIL_FROM to enable email.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from ?? env.emailFrom,
        to: [input.to],
        reply_to: input.replyTo ?? env.emailReplyTo,
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
