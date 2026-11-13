"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form";
import { removeIntegrationAction } from "@/server/actions/integrations";

export function RemoveIntegrationButton({
  provider,
  label,
}: {
  provider: "AI" | "LEAD_SOURCE" | "EMAIL";
  label: string;
}) {
  const [state, action] = useActionState(removeIntegrationAction, initialFormState);

  return (
    <div className="mt-2 space-y-2">
      <form
        action={action}
        onSubmit={(event) => {
          const confirmed = window.confirm(
            `Remove the stored ${label} credentials? Runs that depend on them will stop until new credentials are saved or a deployment default is set.`,
          );
          if (!confirmed) event.preventDefault();
        }}
      >
        <input type="hidden" name="provider" value={provider} />
        <SubmitButton variant="ghost" size="sm" pendingLabel="Removing…">
          Remove stored key
        </SubmitButton>
      </form>
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}
    </div>
  );
}
