"use client";

import { useActionState } from "react";

import { Field, FormMessage, Select, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  APPROVAL_POLICIES,
  APPROVAL_POLICY_LABELS,
  RETENTION_DAY_OPTIONS,
  retentionLabel,
} from "@/lib/compliance/settings";
import { initialFormState } from "@/lib/form";
import {
  requestWorkspaceDeletionAction,
  runRetentionCleanupAction,
  updateComplianceSettingsAction,
} from "@/server/actions/compliance";

export function ComplianceSettingsForm({
  defaults,
  canEdit,
}: {
  defaults: { retentionDays: number | null; approvalPolicy: string };
  canEdit: boolean;
}) {
  const [state, action] = useActionState(updateComplianceSettingsAction, initialFormState);

  // These selects are uncontrolled, so a revalidated page would otherwise keep
  // showing the previous selection after a successful save. Re-keying the form
  // when the saved values change remounts the fields with the server truth.
  return (
    <form
      key={`${defaults.retentionDays ?? "keep"}-${defaults.approvalPolicy}`}
      action={action}
      className="space-y-4"
      noValidate
    >
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Delete inactive leads after"
          htmlFor="retentionDays"
          hint="Leads are soft-deleted after this window, then permanently purged 30 days later."
        >
          <Select
            id="retentionDays"
            name="retentionDays"
            defaultValue={defaults.retentionDays === null ? "keep" : String(defaults.retentionDays)}
            disabled={!canEdit}
          >
            {RETENTION_DAY_OPTIONS.map((days) => (
              <option key={days === null ? "keep" : days} value={days === null ? "keep" : String(days)}>
                {retentionLabel(days)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Who can approve and send outreach"
          htmlFor="approvalPolicy"
          hint="Owner-only approval is the stricter option. Members can still draft messages."
        >
          <Select
            id="approvalPolicy"
            name="approvalPolicy"
            defaultValue={defaults.approvalPolicy}
            disabled={!canEdit}
          >
            {APPROVAL_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {APPROVAL_POLICY_LABELS[policy]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {canEdit ? <SubmitButton pendingLabel="Saving…">Save compliance settings</SubmitButton> : null}
    </form>
  );
}

export function RetentionCleanupForm({ canRun }: { canRun: boolean }) {
  const [state, action] = useActionState(runRetentionCleanupAction, initialFormState);

  return (
    <form action={action} className="space-y-2">
      <SubmitButton variant="secondary" size="sm" pendingLabel="Cleaning up…" disabled={!canRun}>
        Run cleanup now
      </SubmitButton>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export function DeleteWorkspaceForm({
  workspaceName,
  canDelete,
}: {
  workspaceName: string;
  canDelete: boolean;
}) {
  const [state, action] = useActionState(requestWorkspaceDeletionAction, initialFormState);

  return (
    <form action={action} className="space-y-3" noValidate>
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}

      <Field
        label={`Type "${workspaceName}" to confirm`}
        htmlFor="deletion-confirmation"
        hint="Access is revoked immediately for every member. Data is purged after 30 days."
      >
        <TextInput
          id="deletion-confirmation"
          name="confirmation"
          autoComplete="off"
          disabled={!canDelete}
        />
      </Field>
      <Field label="Current password" htmlFor="deletion-password">
        <TextInput
          id="deletion-password"
          name="password"
          type="password"
          autoComplete="current-password"
          disabled={!canDelete}
        />
      </Field>

      <SubmitButton variant="danger" pendingLabel="Deleting…" disabled={!canDelete}>
        Delete workspace
      </SubmitButton>
      {!canDelete ? (
        <p className="text-[11px] leading-relaxed text-muted">
          Only the workspace owner can delete it.
        </p>
      ) : null}
    </form>
  );
}
