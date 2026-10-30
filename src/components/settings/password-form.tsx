"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";

import { changePasswordAction } from "@/server/actions/settings";
import { initialFormState } from "@/lib/form";
import { Field, FormMessage, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialFormState);
  const errors = state.fieldErrors;

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}

      <Field
        label="Current password"
        htmlFor="currentPassword"
        error={errors?.currentPassword?.[0]}
      >
        <TextInput
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="New password"
          htmlFor="newPassword"
          hint="At least 10 characters, including a letter and a number."
          error={errors?.newPassword?.[0]}
        >
          <TextInput
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>
        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          error={errors?.confirmPassword?.[0]}
        >
          <TextInput
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        Changing your password signs out every other session. Your current session stays
        active.
      </p>

      <div className="flex justify-end">
        <SubmitButton variant="secondary" pendingLabel="Updating…">
          <KeyRound className="size-4" aria-hidden="true" />
          Update password
        </SubmitButton>
      </div>
    </form>
  );
}
