"use client";

import { useActionState } from "react";
import { MailPlus } from "lucide-react";

import { inviteMemberAction } from "@/server/actions/team";
import { initialFormState } from "@/lib/form";
import { Field, FormMessage, Select, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function TeamInviteForm({
  canInviteAdmin,
  seatsLeft,
}: {
  canInviteAdmin: boolean;
  seatsLeft: number;
}) {
  const [state, action] = useActionState(inviteMemberAction, initialFormState);
  const errors = state.fieldErrors;

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}

      {seatsLeft <= 0 ? (
        <p className="rounded-xl border border-warning/20 bg-warning-soft px-3.5 py-3 text-[12px] leading-relaxed text-warning">
          Every seat on this plan is in use. Revoke a pending invitation, remove a teammate,
          or upgrade the plan before inviting someone new.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[1.6fr_1fr]">
        <Field label="Work email" htmlFor="invite-email" error={errors?.email?.[0]}>
          <TextInput
            id="invite-email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="teammate@company.com"
            required
          />
        </Field>
        <Field
          label="Role"
          htmlFor="invite-role"
          hint={canInviteAdmin ? undefined : "Only the owner can invite admins."}
          error={errors?.role?.[0]}
        >
          <Select id="invite-role" name="role" defaultValue="MEMBER">
            <option value="MEMBER">Member</option>
            <option value="VIEWER">Viewer</option>
            {canInviteAdmin ? <option value="ADMIN">Admin</option> : null}
          </Select>
        </Field>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-relaxed text-muted">
          Invitations expire after 7 days and reserve a seat while pending. New teammates set
          their own password from the emailed link.
        </p>
        <SubmitButton variant="secondary" pendingLabel="Sending…" disabled={seatsLeft <= 0}>
          <MailPlus className="size-4" aria-hidden="true" />
          Send invitation
        </SubmitButton>
      </div>
    </form>
  );
}
