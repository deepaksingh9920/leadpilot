"use client";

import { useActionState } from "react";
import { X } from "lucide-react";

import { revokeInviteAction } from "@/server/actions/team";
import { initialFormState } from "@/lib/form";
import { SubmitButton } from "@/components/ui/submit-button";

function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [state, action] = useActionState(revokeInviteAction, initialFormState);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="inviteId" value={inviteId} />
      {state.status === "error" ? (
        <span role="alert" className="text-[10px] font-medium text-danger">
          Not revoked
        </span>
      ) : null}
      <SubmitButton variant="ghost" size="sm" pendingLabel="Revoking…" className="px-2">
        <X className="size-3.5" aria-hidden="true" />
        Revoke
      </SubmitButton>
    </form>
  );
}

export function PendingInvites({
  invites,
}: {
  invites: Array<{
    id: string;
    email: string;
    role: string;
    expiresAt: string;
    invitedByName: string | null;
  }>;
}) {
  if (invites.length === 0) return null;

  return (
    <div className="border-t border-line px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Pending invitations · {invites.length}
      </p>
      <ul className="mt-2 divide-y divide-line/70">
        {invites.map((invite) => (
          <li key={invite.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-ink">{invite.email}</p>
              <p className="text-[10px] text-muted">
                {invite.role} · invited by {invite.invitedByName ?? "an admin"} · expires{" "}
                {invite.expiresAt}
              </p>
            </div>
            <RevokeInviteButton inviteId={invite.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
