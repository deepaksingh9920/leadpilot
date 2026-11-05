"use client";

import { Trash2 } from "lucide-react";

import { deleteLeadAction } from "@/server/actions/leads";

export function DeleteLeadForm({
  leadId,
  companyName,
}: {
  leadId: string;
  companyName: string;
}) {
  return (
    <form
      action={deleteLeadAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Remove ${companyName} from this workspace? It is soft-deleted and excluded from lists and exports. The audit log keeps the record.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="leadId" value={leadId} />
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold text-danger transition-colors hover:bg-danger-soft"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Delete lead
      </button>
    </form>
  );
}
