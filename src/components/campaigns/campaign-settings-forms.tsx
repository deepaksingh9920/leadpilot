"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, Select, TextInput } from "@/components/ui/form";
import { initialFormState } from "@/lib/form";
import {
  setCampaignStatusAction,
  updateCampaignCapAction,
} from "@/server/actions/campaigns";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
};

export function CampaignStatusForm({
  campaignId,
  currentStatus,
  canManage,
}: {
  campaignId: string;
  currentStatus: string;
  canManage: boolean;
}) {
  const [state, formAction] = useActionState(setCampaignStatusAction, initialFormState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        {/* React resets uncontrolled fields after a server action, and a
            changing defaultValue does not update an existing <select>. The key
            remounts it so the saved status is shown without a page reload. */}
        <Select
          key={currentStatus}
          name="status"
          defaultValue={currentStatus}
          disabled={!canManage}
          aria-label="Campaign status"
        >
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        {canManage ? (
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Update status
          </SubmitButton>
        ) : null}
      </div>
      {canManage ? <FormMessage status={state.status} message={state.message} /> : null}
    </form>
  );
}

export function CampaignCapForm({
  campaignId,
  dailySendCap,
  canManage,
}: {
  campaignId: string;
  dailySendCap: number;
  canManage: boolean;
}) {
  const [state, formAction] = useActionState(updateCampaignCapAction, initialFormState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <TextInput
          name="dailySendCap"
          type="number"
          min={1}
          max={500}
          defaultValue={dailySendCap}
          disabled={!canManage}
          aria-label="Daily send cap"
        />
        {canManage ? (
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save cap
          </SubmitButton>
        ) : null}
      </div>
      {canManage ? <FormMessage status={state.status} message={state.message} /> : null}
    </form>
  );
}
