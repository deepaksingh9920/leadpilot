"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, Select } from "@/components/ui/form";
import { initialFormState } from "@/lib/form";
import { updateLeadStatusAction } from "@/server/actions/leads";

export function LeadStatusForm({
  leadId,
  currentStatus,
  options,
}: {
  leadId: string;
  currentStatus: string;
  options: { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState(updateLeadStatusAction, initialFormState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        {/* Server actions reset the form; remount when the saved status changes
            so the select reflects the new value instead of the initial one. */}
        <Select
          key={currentStatus}
          name="status"
          defaultValue={currentStatus}
          aria-label="Lead status"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Update status
        </SubmitButton>
      </div>
      <FormMessage status={state.status} message={state.message} />
      {state.fieldErrors?.status?.[0] ? (
        <p className="text-xs font-medium text-danger">{state.fieldErrors.status[0]}</p>
      ) : null}
    </form>
  );
}
