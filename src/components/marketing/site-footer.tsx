import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Logo } from "@/components/ui/logo";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Overview" },
      { href: "/features#agents", label: "Agent team" },
      { href: "/pricing", label: "Pricing" },
      { href: "/signup", label: "Start free" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/features#how-it-works", label: "How it works" },
      { href: "/features#security", label: "Security & compliance" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/features#security", label: "Data sources" },
      { href: "/features#security", label: "Acceptable use" },
      { href: "/features#security", label: "Privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Evidence-first prospecting. Specialist agents do the research, you keep the
            judgement and the final say.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-success/15 bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Human approval on every send
          </div>
        </div>

        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="font-display text-sm font-semibold text-ink">{column.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={`${column.title}-${link.label}`}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} LeadPilot. All rights reserved.</p>
          <p>
            Lead data must come from permitted sources. LeadPilot never scrapes or fabricates
            contact details.
          </p>
        </div>
      </div>
    </footer>
  );
}
