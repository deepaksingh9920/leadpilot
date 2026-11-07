"use client";

import { useActionState } from "react";

import { Field, FormMessage, Select, TextInput, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form";
import {
  approveOutreachMessageAction,
  cancelOutreachMessageAction,
  createOutreachDraftAction,
  recordOutreachOutcomeAction,
  sendOutreachMessageAction,
  updateOutreachDraftAction,
} from "@/server/actions/outreach";

type DraftOption = {
  leadId: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
};

export function CreateOutreachDraftForm({
  campaignId,
  options,
}: {
  campaignId: string;
  options: DraftOption[];
}) {
  const [state, formAction] = useActionState(createOutreachDraftAction, initialFormState);

  if (options.length === 0) {
    return (
      <p className="px-5 py-6 text-sm leading-relaxed text-muted">
        Every eligible lead in this campaign already has an outreach message. Suppressed leads and
        leads without an email are excluded.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <Field
        label="Lead"
        htmlFor="outreach-leadId"
        hint="Only campaigns leads with a stored contact email are listed."
      >
        <Select id="outreach-leadId" name="leadId" defaultValue={options[0]!.leadId}>
          {options.map((option) => (
            <option key={option.leadId} value={option.leadId}>
              {option.companyName}
              {option.contactName ? ` · ${option.contactName}` : ""} · {option.contactEmail}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Subject"
          htmlFor="outreach-subject"
          hint="Optional. Leave blank to use the grounded template."
        >
          <TextInput id="outreach-subject" name="subject" maxLength={160} />
        </Field>
        <Field
          label="Opening body"
          htmlFor="outreach-body"
          hint="Optional. Only stored workspace and lead facts are used."
        >
          <Textarea id="outreach-body" name="body" className="min-h-24" maxLength={5000} />
        </Field>
      </div>

      <FormMessage status={state.status} message={state.message} />
      <div className="flex justify-end">
        <SubmitButton size="sm" pendingLabel="Drafting…">
          Generate draft
        </SubmitButton>
      </div>
    </form>
  );
}

export function OutreachEditorForm({
  messageId,
  campaignId,
  subject,
  body,
  readOnly,
}: {
  messageId: string;
  campaignId: string;
  subject: string;
  body: string;
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState(updateOutreachDraftAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <Field label="Subject" htmlFor="edit-subject">
        <TextInput
          id="edit-subject"
          name="subject"
          defaultValue={subject}
          maxLength={160}
          disabled={readOnly}
        />
      </Field>
      <Field
        label="Body"
        htmlFor="edit-body"
        hint="The unsubscribe footer and sender identity are appended automatically at send time."
      >
        <Textarea
          id="edit-body"
          name="body"
          defaultValue={body}
          className="min-h-56 font-mono text-[12px] leading-relaxed"
          maxLength={5000}
          disabled={readOnly}
        />
      </Field>

      <FormMessage status={state.status} message={state.message} />
      {readOnly ? (
        <p className="text-[11px] text-muted">
          This message is read-only because it is not an editable draft or approved message.
        </p>
      ) : (
        <div className="flex justify-end">
          <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">
            Save draft
          </SubmitButton>
        </div>
      )}
    </form>
  );
}

export function ApproveOutreachForm({
  messageId,
  campaignId,
  canApprove,
}: {
  messageId: string;
  campaignId: string;
  canApprove: boolean;
}) {
  const [state, formAction] = useActionState(approveOutreachMessageAction, initialFormState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <SubmitButton
        size="sm"
        pendingLabel="Approving…"
        disabled={!canApprove}
        className="w-full"
      >
        Approve exact content
      </SubmitButton>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export function SendOutreachForm({
  messageId,
  campaignId,
  canApprove,
}: {
  messageId: string;
  campaignId: string;
  canApprove: boolean;
}) {
  const [state, formAction] = useActionState(sendOutreachMessageAction, initialFormState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <SubmitButton
        size="sm"
        pendingLabel="Sending…"
        disabled={!canApprove}
        className="w-full"
      >
        Send approved message
      </SubmitButton>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export function CancelOutreachForm({
  messageId,
  campaignId,
}: {
  messageId: string;
  campaignId: string;
}) {
  const [state, formAction] = useActionState(cancelOutreachMessageAction, initialFormState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <SubmitButton
        size="sm"
        variant="secondary"
        pendingLabel="Cancelling…"
        className="w-full"
      >
        Cancel message
      </SubmitButton>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export function OutreachOutcomeForm({
  messageId,
  campaignId,
  options,
}: {
  messageId: string;
  campaignId: string;
  options: { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState(recordOutreachOutcomeAction, initialFormState);

  if (options.length === 0) {
    return (
      <p className="text-[11px] leading-relaxed text-muted">
        Every outcome available for this message has already been recorded.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <Field
        label="Outcome"
        htmlFor="outcome-value"
        hint="Recorded manually from a real reply, calendar booking, or bounce notice."
      >
        <Select id="outcome-value" name="outcome" defaultValue={options[0]!.value}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note" htmlFor="outcome-note" hint="Optional. Where the outcome was observed.">
        <Textarea
          id="outcome-note"
          name="note"
          className="min-h-20"
          maxLength={500}
          placeholder="e.g. Reply received in the shared inbox on Tuesday."
        />
      </Field>
      <FormMessage status={state.status} message={state.message} />
      <div className="flex justify-end">
        <SubmitButton size="sm" variant="secondary" pendingLabel="Recording…">
          Record outcome
        </SubmitButton>
      </div>
    </form>
  );
}
