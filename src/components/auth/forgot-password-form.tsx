"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";

import { forgotPasswordAction } from "@/server/actions/auth";
import { initialFormState } from "@/lib/form";
import { Field, FormMessage, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}

      <Field label="Work email" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
      </Field>

      <SubmitButton className="w-full" pendingLabel="Sending…">
        Send reset link
        <ArrowRight className="size-4" aria-hidden="true" />
      </SubmitButton>
    </form>
  );
}
