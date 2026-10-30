"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { ADMIN_NAV, PRIMARY_NAV } from "@/components/app/nav-links";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { logoutAction } from "@/server/actions/auth";
import { cn } from "@/lib/utils";

export function Sidebar({
  user,
  workspace,
  workspaces,
  planName,
  role,
  isSuperAdmin,
}: {
  user: { name: string; email: string };
  workspace: { id: string; name: string };
  workspaces: { id: string; name: string }[];
  planName: string;
  role: string;
  isSuperAdmin: boolean;
}) {
  const pathname = usePathname();
  const items = isSuperAdmin ? [...PRIMARY_NAV, ADMIN_NAV] : PRIMARY_NAV;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center border-b border-line px-5">
        <Logo />
      </div>

      <div className="space-y-3 border-b border-line p-3">
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={workspace.id}
        />
        <div className="flex items-center justify-between px-1">
          <span className="rounded-full border border-brand/15 bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-brand-dark">
            {planName}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            {role}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin" aria-label="Dashboard">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors",
                active
                  ? "bg-brand-soft text-brand-dark ring-1 ring-brand/10"
                  : "text-ink-soft hover:bg-ink/5 hover:text-ink",
              )}
            >
              <item.icon
                className={cn("size-4", active ? "text-brand" : "text-muted")}
                aria-hidden="true"
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
          <Avatar name={user.name} size="sm" />
          <div className="min-w-0 flex-1">
            <Link
              href="/settings"
              className="block truncate text-[13px] font-semibold text-ink hover:underline"
            >
              {user.name}
            </Link>
            <p className="truncate text-[11px] text-muted">{user.email}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
