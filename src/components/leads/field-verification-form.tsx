"use client";

import { useActionState } from "react";

import { Field, FormMessage, Select, TextInput, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form";
import { setLeadFieldVerificationAction } from "@/server/actions/leads";

const STATUS_OPTIONS = [
  { value: "VERIFIED", label: "Verified" },
  { value: "PARTIAL", label: "Partially verified" },
  { value: "UNVERIFIED", label: "Unverified" },
];

export function FieldVerificationForm({
  leadId,
  fields,
}: {
  leadId: string;
  fields: { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState(setLeadFieldVerificationAction, initialFormState);

  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted">
        This lead has no populated fields that can be checked.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Field" htmlFor="verification-field">
          <Select id="verification-field" name="field" defaultValue={fields[0]!.value}>
            {fields.map((field) => (
              <option key={field.value} value={field.value}>
                {field.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Result" htmlFor="verification-status">
          <Select id="verification-status" name="status" defaultValue="VERIFIED">
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="Evidence URL"
        htmlFor="verification-sourceUrl"
        hint="Optional. The page you checked to confirm this value."
      >
        <TextInput
          id="verification-sourceUrl"
          name="sourceUrl"
          type="url"
          inputMode="url"
          placeholder="https://example.com/team"
          maxLength={2000}
        />
      </Field>
      <Field
        label="Note"
        htmlFor="verification-note"
        hint="Optional. Record how the value was checked."
      >
        <Textarea
          id="verification-note"
          name="note"
          className="min-h-20"
          maxLength={500}
          placeholder="e.g. Matched the contact name on the company team page."
        />
      </Field>

      <FormMessage status={state.status} message={state.message} />
      <div className="flex justify-end">
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save field check
        </SubmitButton>
      </div>
    </form>
  );
}
