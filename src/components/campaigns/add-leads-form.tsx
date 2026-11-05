"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form";
import { initialFormState } from "@/lib/form";
import { addLeadsToCampaignAction } from "@/server/actions/campaigns";

type Option = {
  id: string;
  companyName: string;
  domain: string | null;
  contactName: string | null;
  contactEmail: string | null;
};

export function AddLeadsForm({
  campaignId,
  options,
}: {
  campaignId: string;
  options: Option[];
}) {
  const [state, formAction] = useActionState(addLeadsToCampaignAction, initialFormState);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (options.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-muted">
        No qualified leads are available. Mark leads as qualified on the lead detail page first;
        unqualified leads are not added to campaigns.
      </p>
    );
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="max-h-72 overflow-y-auto rounded-xl border border-line scrollbar-thin">
        <ul className="divide-y divide-line">
          {options.map((option) => (
            <li key={option.id}>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-canvas/60">
                <input
                  type="checkbox"
                  name="leadIds"
                  value={option.id}
                  checked={selected.has(option.id)}
                  onChange={() => toggle(option.id)}
                  className="mt-0.5 size-4 accent-[var(--color-brand)]"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">
                    {option.companyName}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {option.contactName ?? "No contact"} · {option.contactEmail ?? option.domain ?? "No email"}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted">{selected.size} selected · maximum 200 per request</p>
        <SubmitButton
          size="sm"
          disabled={selected.size === 0}
          pendingLabel="Adding…"
        >
          Add selected leads
        </SubmitButton>
      </div>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
