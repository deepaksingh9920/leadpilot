"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight } from "lucide-react";

import { loginAction } from "@/server/actions/auth";
import { initialFormState } from "@/lib/form";
import { Field, FormMessage, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <FormMessage status={state.status} message={state.message} /> : null}

      <Field label="Work email" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
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

      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password?.[0]}>
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
      </Field>

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex items-center justify-end">
        <Link
          href="/forgot-password"
          className="text-xs font-semibold text-brand hover:text-brand-dark"
        >
          Forgot password?
        </Link>
      </div>

      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
        <ArrowRight className="size-4" aria-hidden="true" />
      </SubmitButton>
    </form>
  );
}
