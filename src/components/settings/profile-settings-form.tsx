"use client";

import { useActionState } from "react";

import { updateProfileAction } from "@/server/actions/settings";
import { initialFormState } from "@/lib/form";
import { Field, FormMessage, Select, TextInput, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

const INDUSTRIES = [
  "SaaS & Software",
  "Professional Services",
  "E-commerce & Retail",
  "Manufacturing",
  "Financial Services",
  "Healthcare & Life Sciences",
  "Real Estate",
  "Logistics & Transport",
  "Education",
  "Other",
];

const SIZES = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"];

export type ProfileDefaults = {
  name: string;
  workspaceName: string;
  companyName: string;
  website: string;
  industry: string;
  companySize: string;
  regions: string;
  targetCustomerTypes: string;
  budgetMin: string;
  budgetMax: string;
  description: string;
  valueProposition: string;
  phone: string;
  mailingAddress: string;
  senderName: string;
  senderEmail: string;
};

export function ProfileSettingsForm({ defaults }: { defaults: ProfileDefaults }) {
  const [state, action] = useActionState(updateProfileAction, initialFormState);
  const errors = state.fieldErrors;

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" error={errors?.name?.[0]}>
          <TextInput id="name" name="name" defaultValue={defaults.name} />
        </Field>
        <Field
          label="Workspace name"
          htmlFor="workspaceName"
          error={errors?.workspaceName?.[0]}
        >
          <TextInput id="workspaceName" name="workspaceName" defaultValue={defaults.workspaceName} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Company name"
          htmlFor="companyName"
          error={errors?.companyName?.[0]}
        >
          <TextInput id="companyName" name="companyName" defaultValue={defaults.companyName} />
        </Field>
        <Field
          label="Website"
          htmlFor="website"
          hint="Include https://"
          error={errors?.website?.[0]}
        >
          <TextInput
            id="website"
            name="website"
            type="url"
            defaultValue={defaults.website}
            placeholder="https://example.com"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Industry" htmlFor="industry" error={errors?.industry?.[0]}>
          <Select id="industry" name="industry" defaultValue={defaults.industry}>
            <option value="" disabled>
              Select an industry
            </option>
            {INDUSTRIES.map((industry) => (
              <option key={industry} value={industry}>
                {industry}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Company size" htmlFor="companySize" error={errors?.companySize?.[0]}>
          <Select id="companySize" name="companySize" defaultValue={defaults.companySize}>
            <option value="" disabled>
              Select headcount
            </option>
            {SIZES.map((size) => (
              <option key={size} value={size}>
                {size} people
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Target regions"
        htmlFor="regions"
        hint="Countries, states, or cities, separated by commas."
        error={errors?.regions?.[0]}
      >
        <TextInput id="regions" name="regions" defaultValue={defaults.regions} />
      </Field>

      <Field
        label="Target customer types"
        htmlFor="targetCustomerTypes"
        error={errors?.targetCustomerTypes?.[0]}
      >
        <TextInput
          id="targetCustomerTypes"
          name="targetCustomerTypes"
          defaultValue={defaults.targetCustomerTypes}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Minimum deal budget (USD)"
          htmlFor="budgetMin"
          error={errors?.budgetMin?.[0]}
        >
          <TextInput
            id="budgetMin"
            name="budgetMin"
            type="number"
            min={0}
            defaultValue={defaults.budgetMin}
          />
        </Field>
        <Field
          label="Maximum deal budget (USD)"
          htmlFor="budgetMax"
          error={errors?.budgetMax?.[0]}
        >
          <TextInput
            id="budgetMax"
            name="budgetMax"
            type="number"
            min={0}
            defaultValue={defaults.budgetMax}
          />
        </Field>
      </div>

      <Field
        label="What do you offer?"
        htmlFor="valueProposition"
        error={errors?.valueProposition?.[0]}
      >
        <Textarea
          id="valueProposition"
          name="valueProposition"
          defaultValue={defaults.valueProposition}
        />
      </Field>

      <Field
        label="Additional context for agents"
        htmlFor="description"
        hint="Ideal traits, disqualifiers, constraints."
        error={errors?.description?.[0]}
      >
        <Textarea id="description" name="description" defaultValue={defaults.description} />
      </Field>

      <div className="border-t border-line pt-5">
        <h3 className="font-display text-sm font-semibold text-ink">Outreach identity</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Shown to approvers when reviewing drafts. Sending still requires a configured email
          provider and admin approval.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Sender name" htmlFor="senderName" error={errors?.senderName?.[0]}>
            <TextInput id="senderName" name="senderName" defaultValue={defaults.senderName} />
          </Field>
          <Field label="Sender email" htmlFor="senderEmail" error={errors?.senderEmail?.[0]}>
            <TextInput
              id="senderEmail"
              name="senderEmail"
              type="email"
              defaultValue={defaults.senderEmail}
            />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors?.phone?.[0]}>
            <TextInput id="phone" name="phone" defaultValue={defaults.phone} />
          </Field>
        </div>
        <div className="mt-4">
          <Field
            label="Mailing address"
            htmlFor="mailingAddress"
            hint="Required before outreach can be approved. Included in every email footer."
            error={errors?.mailingAddress?.[0]}
          >
            <TextInput
              id="mailingAddress"
              name="mailingAddress"
              defaultValue={defaults.mailingAddress}
              placeholder="123 Main St, Suite 100, City, State 00000"
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end border-t border-line pt-5">
        <SubmitButton pendingLabel="Saving changes…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
