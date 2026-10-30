"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";

import { resetPasswordAction } from "@/server/actions/auth";
import { initialFormState } from "@/lib/form";
import { Field, FormMessage, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />

      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}

      {!token ? (
        <FormMessage
          status="error"
          message="This reset link is missing its token. Request a new link to continue."
        />
      ) : null}

      <Field
        label="New password"
        htmlFor="password"
        hint="At least 10 characters, including a letter and a number."
        error={state.fieldErrors?.password?.[0]}
      >
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Choose a new password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
      </Field>

      <Field
        label="Confirm new password"
        htmlFor="confirmPassword"
        error={state.fieldErrors?.confirmPassword?.[0]}
      >
        <TextInput
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat the new password"
          required
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
        />
      </Field>

      <SubmitButton className="w-full" pendingLabel="Updating password…" disabled={!token}>
        Update password
        <ArrowRight className="size-4" aria-hidden="true" />
      </SubmitButton>
    </form>
  );
}
