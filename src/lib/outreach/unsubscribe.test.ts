import { beforeAll, describe, expect, it } from "vitest";

import {
  buildOutreachPreview,
  composeOutreachBody,
  contentToHtml,
  createUnsubscribeToken,
  unsubscribeFooterParts,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "@/lib/outreach/unsubscribe";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-bytes-long";
  process.env.APP_URL = "https://app.leadpilot.test";
});

const payload = {
  v: 1 as const,
  workspaceId: "ws_123",
  messageId: "msg_456",
  email: "dana@acme.test",
};

describe("signed unsubscribe tokens", () => {
  it("round-trips a signed payload", () => {
    const token = createUnsubscribeToken(payload);
    expect(verifyUnsubscribeToken(token)).toEqual(payload);
  });

  it("is deterministic for the same payload", () => {
    expect(createUnsubscribeToken(payload)).toBe(createUnsubscribeToken(payload));
  });

  it("rejects a tampered payload", () => {
    const token = createUnsubscribeToken(payload);
    const [encoded, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...payload, email: "attacker@example.test" }),
    ).toString("base64url");
    expect(verifyUnsubscribeToken(`${forged}.${signature}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${encoded}.${signature}tampered`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("not-a-token")).toBeNull();
    expect(verifyUnsubscribeToken("a.b.c")).toBeNull();
    expect(verifyUnsubscribeToken("x".repeat(5000))).toBeNull();
  });

  it("builds a public app URL", () => {
    const token = createUnsubscribeToken(payload);
    expect(unsubscribeUrl(token)).toBe(
      `https://app.leadpilot.test/unsubscribe/${encodeURIComponent(token)}`,
    );
  });
});

describe("unsubscribe footer and preview", () => {
  it("includes sender identity, mailing address, reason, and link", () => {
    const parts = unsubscribeFooterParts({
      senderName: "Alex",
      companyName: "Sender Co",
      mailingAddress: "1 Main St, Springfield",
      reason: "we believe this is relevant.",
      url: "https://app.leadpilot.test/unsubscribe/token",
    });

    expect(parts.text).toContain("You are receiving this message because we believe this is relevant.");
    expect(parts.text).toContain("Alex, Sender Co");
    expect(parts.text).toContain("1 Main St, Springfield");
    expect(parts.text).toContain("Unsubscribe: https://app.leadpilot.test/unsubscribe/token");
    expect(parts.html).toContain("Unsubscribe");
  });

  it("escapes HTML and never accepts raw markup", () => {
    const html = contentToHtml('Hello <script>alert("x")</script> & welcome');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; welcome");
  });

  it("rebuilds the exact preview with the footer appended", () => {
    const preview = buildOutreachPreview({
      workspaceId: payload.workspaceId,
      messageId: payload.messageId,
      email: payload.email,
      subject: "Quick question",
      body: "Hello there.\n\nAre you open to a chat?",
      leadCompanyName: "Acme",
      senderName: "Alex",
      companyName: "Sender Co",
      mailingAddress: "1 Main St",
    });

    expect(preview.subject).toBe("Quick question");
    expect(preview.text).toContain("Hello there.");
    expect(preview.text).toContain("Unsubscribe:");
    expect(preview.html).toContain("<p");
    expect(verifyUnsubscribeToken(preview.token)).toEqual(payload);
    expect(preview.url).toContain(preview.token);
  });

  it("composes content and footer without duplicating whitespace", () => {
    const composed = composeOutreachBody(" Body text ", {
      text: "Footer",
      html: "<footer />",
    });
    expect(composed.text).toBe("Body text\n\nFooter");
    expect(composed.html).toBe('<p style="margin:0 0 16px;line-height:1.6;">Body text</p><footer />');
  });
});
