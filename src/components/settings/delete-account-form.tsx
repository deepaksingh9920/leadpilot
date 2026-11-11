"use client";

import { useActionState } from "react";
import { UserX } from "lucide-react";

import { Field, FormMessage, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form";
import { deleteAccountAction } from "@/server/actions/settings";

export function DeleteAccountForm({
  email,
  blockedReason,
}: {
  email: string;
  blockedReason?: string;
}) {
  const [state, action] = useActionState(deleteAccountAction, initialFormState);
  const errors = state.fieldErrors;

  if (blockedReason) {
    return (
      <p className="rounded-xl border border-warning/20 bg-warning-soft px-3.5 py-3 text-[12px] leading-relaxed text-warning">
        {blockedReason}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}

      <div className="rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-3 text-[12px] leading-relaxed text-danger">
        <p className="font-semibold">This closes your account immediately and cannot be undone.</p>
        <p className="mt-1">
          Your name, email, password, sessions, pending invitations, and workspace memberships
          are removed. Records you created stay in their workspaces and appear as
          &ldquo;Deleted user&rdquo;. Audit and billing history is retained for security and legal
          obligations.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Confirm account email"
          htmlFor="delete-account-email"
          hint="Type the email shown on this page exactly."
          error={errors?.email?.[0]}
        >
          <TextInput
            id="delete-account-email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder={email}
            required
          />
        </Field>
        <Field
          label="Current password"
          htmlFor="delete-account-password"
          error={errors?.password?.[0]}
        >
          <TextInput
            id="delete-account-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
      </div>

      <div className="space-y-1.5">
        <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-soft">
          <input
            type="checkbox"
            name="confirm"
            className="mt-0.5 size-4 rounded border-line-strong accent-danger"
            aria-invalid={Boolean(errors?.confirm)}
          />
          <span>I understand this cannot be undone and that workspace records are retained.</span>
        </label>
        {errors?.confirm?.[0] ? (
          <p className="text-xs font-medium text-danger" role="alert">
            {errors.confirm[0]}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end border-t border-line pt-4">
        <SubmitButton variant="danger" pendingLabel="Closing account…">
          <UserX className="size-4" aria-hidden="true" />
          Delete my account
        </SubmitButton>
      </div>
    </form>
  );
}
