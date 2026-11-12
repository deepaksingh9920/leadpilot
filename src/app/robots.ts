import type { MetadataRoute } from "next";

const baseUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Only the public marketing pages are meant to be indexed. Authenticated
 * workspace, admin, onboarding, invitation, and unsubscribe URLs are excluded;
 * the authenticated layouts also send `noindex` so a crawler that ignores this
 * file still cannot index private screens.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/dashboard",
        "/leads",
        "/agents",
        "/campaigns",
        "/runs",
        "/settings",
        "/integrations",
        "/onboarding",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
        "/invite/",
        "/unsubscribe/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
