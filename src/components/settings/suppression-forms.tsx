"use client";

import { useActionState } from "react";

import { Field, FormMessage, Select, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form";
import {
  addSuppressionAction,
  importSuppressionsAction,
  removeSuppressionAction,
} from "@/server/actions/suppression";
import { SUPPRESSION_REASONS, SUPPRESSION_REASON_LABELS } from "@/lib/outreach/suppression";

export function AddSuppressionForm() {
  const [state, formAction] = useActionState(addSuppressionAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Email address" htmlFor="suppression-email">
        <TextInput
          id="suppression-email"
          name="email"
          type="email"
          placeholder="person@company.com"
          required
        />
      </Field>
      <Field label="Reason" htmlFor="suppression-reason">
        <Select id="suppression-reason" name="reason" defaultValue="MANUAL">
          {SUPPRESSION_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {SUPPRESSION_REASON_LABELS[reason]}
            </option>
          ))}
        </Select>
      </Field>
      <FormMessage status={state.status} message={state.message} />
      <div className="flex justify-end">
        <SubmitButton size="sm" pendingLabel="Adding…">
          Add to suppression list
        </SubmitButton>
      </div>
    </form>
  );
}

export function ImportSuppressionsForm() {
  const [state, formAction] = useActionState(importSuppressionsAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="CSV file"
        htmlFor="suppression-file"
        hint="Needs an Email column. An optional Reason column accepts UNSUBSCRIBED, BOUNCED, COMPLAINT, or MANUAL."
      >
        <input
          id="suppression-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="input h-auto py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-brand-dark"
        />
      </Field>
      <FormMessage status={state.status} message={state.message} />
      <div className="flex justify-end">
        <SubmitButton size="sm" variant="secondary" pendingLabel="Importing…">
          Import suppressions
        </SubmitButton>
      </div>
    </form>
  );
}

export function RemoveSuppressionForm({ entryId }: { entryId: string }) {
  const [state, formAction] = useActionState(removeSuppressionAction, initialFormState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="entryId" value={entryId} />
      <SubmitButton size="sm" variant="ghost" pendingLabel="Removing…">
        Remove
      </SubmitButton>
      {state.status === "error" ? (
        <p className="mt-1 text-[10px] text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
