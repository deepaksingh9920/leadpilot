import type { NextConfig } from "next";

import { buildSecurityHeaders } from "./src/lib/security/headers";

const securityHeaders = buildSecurityHeaders({
  isProduction: process.env.NODE_ENV === "production",
});

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
