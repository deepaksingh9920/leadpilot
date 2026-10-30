"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";

import { signupAction } from "@/server/actions/auth";
import { initialFormState } from "@/lib/form";
import { Field, FormMessage, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function SignupForm({ plan }: { plan?: string }) {
  const [state, action] = useActionState(signupAction, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}
      {plan ? (
        <div className="rounded-xl border border-brand/15 bg-brand-soft px-3.5 py-2.5 text-xs font-medium text-brand-dark">
          Creating a Free workspace. You can move to the {plan} plan after billing is
          connected — no payment is taken today.
        </div>
      ) : null}

      <Field label="Full name" htmlFor="name" error={state.fieldErrors?.name?.[0]}>
        <TextInput
          id="name"
          name="name"
          autoComplete="name"
          placeholder="Jordan Ellis"
          required
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
      </Field>

      <Field
        label="Work email"
        htmlFor="email"
        error={state.fieldErrors?.email?.[0]}
      >
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
      </Field>

      <Field
        label="Company or workspace name"
        htmlFor="companyName"
        hint="This becomes your workspace name. You can change it later."
        error={state.fieldErrors?.companyName?.[0]}
      >
        <TextInput
          id="companyName"
          name="companyName"
          autoComplete="organization"
          placeholder="Northstar Studio"
          required
          aria-invalid={Boolean(state.fieldErrors?.companyName)}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint="At least 10 characters, including a letter and a number."
        error={state.fieldErrors?.password?.[0]}
      >
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Choose a strong password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
      </Field>

      <div className="space-y-1.5">
        <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-soft">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-0.5 size-4 rounded border-line-strong accent-brand"
            aria-invalid={Boolean(state.fieldErrors?.acceptTerms)}
          />
          <span>
            I agree to use only permitted data sources and understand that outreach requires
            human approval.
          </span>
        </label>
        {state.fieldErrors?.acceptTerms?.[0] ? (
          <p className="text-xs font-medium text-danger" role="alert">
            {state.fieldErrors.acceptTerms[0]}
          </p>
        ) : null}
      </div>

      <SubmitButton className="w-full" pendingLabel="Creating workspace…">
        Create free workspace
        <ArrowRight className="size-4" aria-hidden="true" />
      </SubmitButton>
    </form>
  );
}
