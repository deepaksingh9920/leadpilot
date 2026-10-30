"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { ADMIN_NAV, PRIMARY_NAV } from "@/components/app/nav-links";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

export function MobileNav({
  isSuperAdmin,
  workspaceName,
  planName,
}: {
  isSuperAdmin: boolean;
  workspaceName: string;
  planName: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = isSuperAdmin ? [...PRIMARY_NAV, ADMIN_NAV] : PRIMARY_NAV;

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink"
        aria-label="Open navigation"
        aria-expanded={open}
      >
        <Menu className="size-4" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 flex w-[84%] max-w-xs flex-col border-r border-line bg-surface shadow-lift">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink"
                aria-label="Close navigation"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="border-b border-line px-4 py-3">
              <p className="truncate text-sm font-semibold text-ink">{workspaceName}</p>
              <p className="text-[11px] font-medium text-muted">{planName} plan</p>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Dashboard">
              {items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                      active
                        ? "bg-brand-soft text-brand-dark"
                        : "text-ink-soft hover:bg-ink/5",
                    )}
                  >
                    <item.icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-line p-3">
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-ink/5"
              >
                Account settings
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
