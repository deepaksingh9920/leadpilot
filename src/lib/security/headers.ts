export type SecurityHeader = { key: string; value: string };

/**
 * Builds the response headers applied to every route.
 *
 * The CSP is intentionally nonce-free: the public marketing pages are statically
 * generated, and a nonce policy would require every page to be dynamically
 * rendered. `'unsafe-inline'` is therefore required for the framework's inline
 * bootstrap scripts and Tailwind's injected styles. Everything else is locked
 * down: no external script/style origins, no plugins, no framing, no base-tag
 * hijacking, and form posts restricted to this origin. See docs/SECURITY.md for
 * the residual risk and the path to a strict nonce policy.
 */
export function buildSecurityHeaders({
  isProduction,
}: {
  isProduction: boolean;
}): SecurityHeader[] {
  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isProduction ? "" : " ws: wss:"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const headers: SecurityHeader[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];

  if (isProduction) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}
