"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Field, FormMessage, TextInput, Textarea } from "@/components/ui/form";
import { initialFormState } from "@/lib/form";
import { createCampaignAction } from "@/server/actions/campaigns";

export function NewCampaignForm() {
  const [state, formAction] = useActionState(createCampaignAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Campaign name"
        htmlFor="campaign-name"
        error={state.fieldErrors?.name?.[0]}
        hint="Something you will recognize later, e.g. “US SaaS founders — Q4”."
      >
        <TextInput
          id="campaign-name"
          name="name"
          required
          maxLength={120}
          placeholder="Q4 outreach — mid-market SaaS"
        />
      </Field>

      <Field
        label="Goal"
        htmlFor="campaign-goal"
        error={state.fieldErrors?.goal?.[0]}
        hint="Optional. What counts as success for this campaign?"
      >
        <Textarea
          id="campaign-goal"
          name="goal"
          maxLength={500}
          placeholder="Book 10 discovery calls with operations leaders at 50–500 person SaaS companies."
        />
      </Field>

      <Field
        label="Daily send cap"
        htmlFor="campaign-cap"
        error={state.fieldErrors?.dailySendCap?.[0]}
        hint="Hard ceiling for any future sending. Sending is not enabled in this build."
      >
        <TextInput
          id="campaign-cap"
          name="dailySendCap"
          type="number"
          min={1}
          max={500}
          defaultValue={50}
          required
        />
      </Field>

      <SubmitButton pendingLabel="Creating…">Create campaign</SubmitButton>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
