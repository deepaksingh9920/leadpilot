/**
 * Signed unsubscribe links.
 *
 * The token is deterministic for a workspace/message/email triple, so the server
 * can rebuild it at send time without storing plaintext. Only its SHA-256 hash is
 * stored on the message, and the unsubscribe route verifies both the signature
 * and that hash before recording a suppression.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { requireAuthSecret } from "@/lib/env";

export type UnsubscribePayload = {
  v: 1;
  workspaceId: string;
  messageId: string;
  email: string;
};

const MAX_TOKEN_LENGTH = 4096;

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function signature(payload: string): string {
  return createHmac("sha256", requireAuthSecret()).update(payload).digest("base64url");
}

function isPayload(value: unknown): value is UnsubscribePayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.v === 1 &&
    typeof candidate.workspaceId === "string" &&
    candidate.workspaceId.length > 0 &&
    typeof candidate.messageId === "string" &&
    candidate.messageId.length > 0 &&
    typeof candidate.email === "string" &&
    candidate.email.length > 0
  );
}

export function createUnsubscribeToken(payload: UnsubscribePayload): string {
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribePayload | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;

  const encoded = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const expected = signature(encoded);

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
    if (!isPayload(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function unsubscribeUrl(token: string): string {
  requireAuthSecret();
  return `${appUrl()}/unsubscribe/${encodeURIComponent(token)}`;
}

function appUrl(): string {
  return (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type FooterIdentity = {
  senderName?: string | null;
  companyName: string;
  mailingAddress?: string | null;
  reason: string;
  url: string;
};

export function unsubscribeFooterParts(input: FooterIdentity): {
  text: string;
  html: string;
} {
  const identity = [input.senderName, input.companyName].filter(Boolean).join(", ");
  const address = input.mailingAddress?.trim();

  const text = [
    "—",
    `You are receiving this message because ${input.reason}`,
    identity,
    address ? address : null,
    `Unsubscribe: ${input.url}`,
  ]
    .filter((line): line is string => Boolean(line && line.trim().length > 0))
    .join("\n");

  const html = [
    '<hr style="border:0;border-top:1px solid #e7e4dc;margin:24px 0;" />',
    `<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b7280;">You are receiving this message because ${escapeHtml(input.reason)}</p>`,
    `<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b7280;">${escapeHtml(identity)}${address ? `<br />${escapeHtml(address)}` : ""}</p>`,
    `<p style="margin:0;font-size:12px;line-height:1.6;"><a href="${escapeHtml(input.url)}" style="color:#4338ca;">Unsubscribe</a></p>`,
  ].join("");

  return { text, html };
}

export function composeOutreachBody(
  content: string,
  parts: { text: string; html: string },
): { text: string; html: string } {
  return {
    text: `${content.trim()}\n\n${parts.text}`,
    html: `${contentToHtml(content)}${parts.html}`,
  };
}

export type OutreachPreviewInput = {
  workspaceId: string;
  messageId: string;
  email: string;
  subject: string;
  body: string;
  leadCompanyName: string;
  senderName?: string | null;
  companyName: string;
  mailingAddress?: string | null;
};

/** Rebuilds the exact text and HTML that will be sent, including the footer. */
export function buildOutreachPreview(input: OutreachPreviewInput): {
  subject: string;
  text: string;
  html: string;
  url: string;
  token: string;
} {
  const token = createUnsubscribeToken({
    v: 1,
    workspaceId: input.workspaceId,
    messageId: input.messageId,
    email: input.email,
  });
  const url = unsubscribeUrl(token);
  const composed = composeOutreachBody(
    input.body,
    unsubscribeFooterParts({
      senderName: input.senderName,
      companyName: input.companyName,
      mailingAddress: input.mailingAddress,
      reason: `we believe ${input.companyName} may be relevant to ${input.leadCompanyName}.`,
      url,
    }),
  );

  return { subject: input.subject, ...composed, url, token };
}

/** Minimal, safe HTML: paragraphs and line breaks only, no raw user HTML. */
export function contentToHtml(content: string): string {
  return content
    .trim()
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;line-height:1.6;">${paragraph
          .split("\n")
          .map((line) => escapeHtml(line))
          .join("<br />")}</p>`,
    )
    .join("");
}
