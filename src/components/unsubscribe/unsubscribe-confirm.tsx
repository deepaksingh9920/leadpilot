"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form";
import { confirmUnsubscribeAction } from "@/server/actions/unsubscribe";

export function UnsubscribeConfirmForm({
  token,
  alreadySuppressed,
}: {
  token: string;
  alreadySuppressed: boolean;
}) {
  const [state, formAction] = useActionState(confirmUnsubscribeAction, initialFormState);

  if (state.status === "success") {
    return <FormMessage status="success" message={state.message} />;
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton className="w-full" pendingLabel="Updating…">
        {alreadySuppressed ? "Confirm do-not-contact" : "Unsubscribe me"}
      </SubmitButton>
    </form>
  );
}
