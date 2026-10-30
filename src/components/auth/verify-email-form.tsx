"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";

import { verifyEmailAction } from "@/server/actions/auth";
import { initialFormState } from "@/lib/form";
import { FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState(verifyEmailAction, initialFormState);

  if (!token) {
    return (
      <FormMessage
        status="error"
        message="This verification link is missing its token. Sign in and request a new email."
      />
    );
  }

  if (state.status === "success") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-success/15 bg-success-soft px-4 py-4 text-success">
          <MailCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Email verified</p>
            <p className="mt-1 text-[13px] leading-relaxed">
              Your account is confirmed. You can close this page and continue in your
              workspace.
            </p>
          </div>
        </div>
        <a
          href="/dashboard"
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Go to dashboard
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}
      <SubmitButton className="w-full" pendingLabel="Verifying…">
        Verify my email
      </SubmitButton>
    </form>
  );
}
