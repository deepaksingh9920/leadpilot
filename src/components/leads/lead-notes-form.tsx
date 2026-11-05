"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, Textarea } from "@/components/ui/form";
import { initialFormState } from "@/lib/form";
import { saveLeadNotesAction } from "@/server/actions/leads";

export function LeadNotesForm({
  leadId,
  notes,
}: {
  leadId: string;
  notes: string | null;
}) {
  const [state, formAction] = useActionState(saveLeadNotesAction, initialFormState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />
      <Textarea
        name="notes"
        defaultValue={notes ?? ""}
        maxLength={5000}
        placeholder="Context for your team: call notes, timing, objections. Never paste sensitive personal data."
        aria-label="Lead notes"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted">Stored in this workspace only. Max 5,000 characters.</p>
        <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">
          Save notes
        </SubmitButton>
      </div>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
