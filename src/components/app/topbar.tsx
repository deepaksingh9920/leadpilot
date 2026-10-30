import Link from "next/link";

import { MobileNav } from "@/components/app/mobile-nav";
import { PageTitle } from "@/components/app/page-title";
import { Badge } from "@/components/ui/badge";

export function Topbar({
  workspaceName,
  planName,
  isSuperAdmin,
}: {
  workspaceName: string;
  planName: string;
  isSuperAdmin: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <MobileNav
          isSuperAdmin={isSuperAdmin}
          workspaceName={workspaceName}
          planName={planName}
        />
        <PageTitle />
        <div className="ml-auto flex items-center gap-2">
          <Badge tone="outline" className="hidden sm:inline-flex">
            {planName} plan
          </Badge>
          <Link
            href="/settings"
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-ink/5 hover:text-ink"
          >
            Account
          </Link>
        </div>
      </div>
    </header>
  );
}
