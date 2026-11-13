"use client";

import { useActionState } from "react";

import { Field, FormMessage, Select, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form";
import {
  LEAD_SOURCE_PROVIDERS,
  PROVIDER_LABELS,
  type LeadSourceProviderId,
} from "@/lib/providers/types";
import { saveIntegrationAction } from "@/server/actions/integrations";

export type IntegrationDefaults = {
  model?: string;
  baseUrl?: string;
  leadSource?: LeadSourceProviderId;
  from?: string;
  replyTo?: string;
};

export function IntegrationCredentialsForm({
  provider,
  hasStored,
  defaults,
}: {
  provider: "AI" | "LEAD_SOURCE" | "EMAIL";
  hasStored: boolean;
  defaults: IntegrationDefaults;
}) {
  const [state, action] = useActionState(saveIntegrationAction, initialFormState);
  const errors = state.fieldErrors;
  const prefix = provider.toLowerCase();

  return (
    <form action={action} className="mt-3 space-y-3" noValidate>
      <input type="hidden" name="provider" value={provider} />

      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}

      {provider === "LEAD_SOURCE" ? (
        <Field
          label="Lead source"
          htmlFor={`${prefix}-leadSource`}
          error={errors?.provider?.[0]}
        >
          <Select
            id={`${prefix}-leadSource`}
            name="leadSource"
            defaultValue={defaults.leadSource ?? "apollo"}
          >
            {LEAD_SOURCE_PROVIDERS.map((id) => (
              <option key={id} value={id}>
                {PROVIDER_LABELS[id]}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field
        label="API key"
        htmlFor={`${prefix}-apiKey`}
        hint="Stored encrypted and never shown again. Paste it here; do not reuse a key from another workspace."
        error={errors?.apiKey?.[0]}
      >
        <TextInput
          id={`${prefix}-apiKey`}
          name="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste the provider key"
          required
        />
      </Field>

      {provider === "AI" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Model"
            htmlFor={`${prefix}-model`}
            hint="For example gpt-4.1-mini or a model ID from your provider."
            error={errors?.model?.[0]}
          >
            <TextInput
              id={`${prefix}-model`}
              name="model"
              defaultValue={defaults.model ?? ""}
              placeholder="gpt-4.1-mini"
              required
            />
          </Field>
          <Field
            label="Base URL (optional)"
            htmlFor={`${prefix}-baseUrl`}
            hint="Only for non-OpenAI endpoints, such as a gateway."
            error={errors?.baseUrl?.[0]}
          >
            <TextInput
              id={`${prefix}-baseUrl`}
              name="baseUrl"
              type="url"
              defaultValue={defaults.baseUrl ?? ""}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
        </div>
      ) : null}

      {provider === "EMAIL" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Sender address"
            htmlFor={`${prefix}-from`}
            hint="Must be on a domain verified in the same Resend account."
            error={errors?.from?.[0]}
          >
            <TextInput
              id={`${prefix}-from`}
              name="from"
              type="email"
              defaultValue={defaults.from ?? ""}
              placeholder="outreach@yourdomain.com"
              required
            />
          </Field>
          <Field
            label="Reply-to (optional)"
            htmlFor={`${prefix}-replyTo`}
            error={errors?.replyTo?.[0]}
          >
            <TextInput
              id={`${prefix}-replyTo`}
              name="replyTo"
              type="email"
              defaultValue={defaults.replyTo ?? ""}
              placeholder="you@yourdomain.com"
            />
          </Field>
        </div>
      ) : null}

      {provider === "LEAD_SOURCE" ? (
        <Field
          label="Base URL (optional)"
          htmlFor={`${prefix}-baseUrl`}
          hint="Leave empty to use the provider's standard endpoint."
          error={errors?.baseUrl?.[0]}
        >
          <TextInput
            id={`${prefix}-baseUrl`}
            name="baseUrl"
            type="url"
            defaultValue={defaults.baseUrl ?? ""}
            placeholder="https://api.apollo.io/v1"
          />
        </Field>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="sm" pendingLabel="Saving…">
          {hasStored ? "Replace credentials" : "Save credentials"}
        </SubmitButton>
        <p className="text-[11px] text-muted">
          Saving replaces any key stored for this workspace. The value is write-only.
        </p>
      </div>
    </form>
  );
}
