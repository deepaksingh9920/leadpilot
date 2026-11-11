"use client";

import { useActionState } from "react";
import { ArrowRightLeft } from "lucide-react";

import { Field, FormMessage, Select, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form";
import { transferOwnershipAction } from "@/server/actions/team";

export type OwnershipCandidate = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export function OwnershipTransferForm({
  candidates,
  canTransfer,
}: {
  candidates: OwnershipCandidate[];
  canTransfer: boolean;
}) {
  const [state, action] = useActionState(transferOwnershipAction, initialFormState);
  const errors = state.fieldErrors;

  if (!canTransfer) {
    return (
      <p className="text-[11px] leading-relaxed text-muted">
        Only the workspace owner can transfer ownership.
      </p>
    );
  }

  if (candidates.length === 0) {
    return (
      <p className="text-[11px] leading-relaxed text-muted">
        Invite another teammate first. Viewers cannot become the owner, so choose a member or
        admin when inviting.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="New owner"
          htmlFor="ownership-target"
          hint="They must already be a member or admin of this workspace."
        >
          <Select id="ownership-target" name="targetUserId" defaultValue={candidates[0]?.id}>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} ({candidate.role.toLowerCase()}) — {candidate.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Current password"
          htmlFor="ownership-password"
          error={errors?.password?.[0]}
        >
          <TextInput
            id="ownership-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-[11px] leading-relaxed text-muted">
          Transfer is immediate. You become an admin, the new owner gains billing, team, and
          deletion controls, and the Razorpay subscription (if any) stays attached to the
          workspace.
        </p>
        <SubmitButton variant="secondary" pendingLabel="Transferring…">
          <ArrowRightLeft className="size-4" aria-hidden="true" />
          Transfer ownership
        </SubmitButton>
      </div>
    </form>
  );
}
