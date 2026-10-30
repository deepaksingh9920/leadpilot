import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "LeadPilot — Evidence-first AI prospecting",
    template: "%s · LeadPilot",
  },
  description:
    "Specialist AI agents find real businesses, research them, score fit, and draft outreach you approve. Every field stays tied to its source.",
  applicationName: "LeadPilot",
  robots: { index: true, follow: true },
  openGraph: {
    title: "LeadPilot — Evidence-first AI prospecting",
    description:
      "Find your next customers without losing the evidence. Source-linked leads, transparent scoring, human-approved outreach.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f5f0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
