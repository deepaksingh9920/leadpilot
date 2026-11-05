import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { NewCampaignForm } from "@/components/campaigns/new-campaign-form";
import { requireWorkspace, roleAtLeast } from "@/lib/auth/workspace";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const context = await requireWorkspace();
  if (!context.workspace) return null;

  const canCreate = roleAtLeast(context.role, "MEMBER");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/campaigns"
          className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to campaigns
        </Link>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">New campaign</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          Group qualified leads around one goal. Creating a campaign does not send anything — every
          message is drafted first and requires human approval.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="p-5">
          {canCreate ? (
            <NewCampaignForm />
          ) : (
            <Alert tone="info" title="View-only role">
              Your role can view campaigns but not create them. Ask a workspace member or admin.
            </Alert>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-sm font-semibold text-ink">What a campaign does</h2>
            <ul className="mt-2 space-y-2 text-[12px] leading-relaxed text-muted">
              <li>Holds a set of qualified leads and their outreach stage.</li>
              <li>Applies a hard daily send cap to any future sending.</li>
              <li>Groups drafts and approvals so a human can review each message.</li>
              <li>Records every status change and cap change in the audit log.</li>
            </ul>
          </Card>

          <Alert tone="shield" title="Cap before approval">
            A campaign cannot send while it has no leads, and no send path exists until an email
            provider is configured and outreach is approved. Caps are ceilings, not targets.
          </Alert>
        </div>
      </div>
    </div>
  );
}
