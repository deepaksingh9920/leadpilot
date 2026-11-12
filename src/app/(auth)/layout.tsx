import Link from "next/link";
import { ArrowLeft, BadgeCheck, Lock, ScrollText } from "lucide-react";

import { Logo } from "@/components/ui/logo";

// Auth screens include invitation and reset links with tokens; keep them out of search.
export const metadata = {
  robots: { index: false, follow: false },
};

const points = [
  { icon: BadgeCheck, text: "Source-linked leads and field-level verification" },
  { icon: Lock, text: "Human approval required before any email is sent" },
  { icon: ScrollText, text: "Audit logs for logins, approvals, and sends" },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[0.92fr_1.08fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-white lg:flex">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(67,56,202,0.45),transparent_45%),radial-gradient(circle_at_85%_85%,rgba(180,83,9,0.28),transparent_45%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px]"
        />

        <div className="relative">
          <Logo inverted />
        </div>

        <div className="relative max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-300">
            Evidence-first prospecting
          </p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight text-white">
            Research you can defend. Outreach you control.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/65">
            LeadPilot keeps every company fact attached to its source, and keeps every send
            behind a human decision.
          </p>

          <ul className="mt-8 space-y-3.5">
            {points.map((point) => (
              <li key={point.text} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                  <point.icon className="size-3.5 text-amber-300" aria-hidden="true" />
                </span>
                <span className="text-[13px] leading-relaxed text-white/75">{point.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-xs text-white/40">
          <span>© {new Date().getFullYear()} LeadPilot</span>
          <Link href="/" className="inline-flex items-center gap-1.5 hover:text-white/70">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to site
          </Link>
        </div>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between border-b border-line bg-canvas px-5 py-4 lg:hidden">
          <Logo />
          <Link href="/" className="text-xs font-medium text-muted hover:text-ink">
            Back to site
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}
