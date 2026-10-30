"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/leads": "Leads",
  "/campaigns": "Campaigns",
  "/agents": "Agents",
  "/integrations": "Integrations",
  "/settings": "Settings",
  "/admin": "Platform admin",
};

export function PageTitle() {
  const pathname = usePathname();
  const key = Object.keys(TITLES).find(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
  const title = key ? TITLES[key] : "Workspace";

  return (
    <div className="min-w-0">
      <p className="truncate font-display text-[15px] font-semibold text-ink">{title}</p>
      <p className="hidden text-[11px] text-muted sm:block">
        <Link href="/dashboard" className="hover:text-ink">
          Workspace
        </Link>
        <span className="mx-1.5 text-line-strong">/</span>
        <span>{title}</span>
      </p>
    </div>
  );
}
