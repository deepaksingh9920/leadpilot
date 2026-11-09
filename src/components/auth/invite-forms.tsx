"use client";

import { useActionState } from "react";
import { Check, UserPlus } from "lucide-react";

import {
  acceptInviteAction,
  acceptInviteRegistrationAction,
} from "@/server/actions/team";
import { initialFormState } from "@/lib/form";
import { Field, FormMessage, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInviteAction, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}
      <SubmitButton pendingLabel="Joining…">
        <Check className="size-4" aria-hidden="true" />
        Accept invitation
      </SubmitButton>
    </form>
  );
}

export function InviteRegistrationForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInviteRegistrationAction, initialFormState);
  const errors = state.fieldErrors;

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}

      <Field label="Full name" htmlFor="invite-name" error={errors?.name?.[0]}>
        <TextInput
          id="invite-name"
          name="name"
          autoComplete="name"
          placeholder="Alex Morgan"
          required
        />
      </Field>

      <Field
        label="Create a password"
        htmlFor="invite-password"
        hint="At least 10 characters, including a letter and a number."
        error={errors?.password?.[0]}
      >
        <TextInput
          id="invite-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Field
        label="Confirm password"
        htmlFor="invite-confirm-password"
        error={errors?.confirmPassword?.[0] ?? errors?.email?.[0]}
      >
        <TextInput
          id="invite-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <SubmitButton pendingLabel="Joining…">
        <UserPlus className="size-4" aria-hidden="true" />
        Create account and join
      </SubmitButton>
    </form>
  );
}
