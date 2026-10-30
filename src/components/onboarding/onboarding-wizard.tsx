"use client";

import { useActionState, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Sparkles, Target } from "lucide-react";

import { Field, FormMessage, Select, TextInput, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { completeOnboardingAction } from "@/server/actions/onboarding";
import { initialFormState } from "@/lib/form";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    title: "Your business",
    description: "This tells the research agents what your company actually does.",
    icon: Building2,
  },
  {
    title: "Your market",
    description: "Define who is a good fit, where they are, and what they can spend.",
    icon: Target,
  },
  {
    title: "Your edge",
    description: "Give the outreach agent grounded context for personalized drafts.",
    icon: Sparkles,
  },
];

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

const STEP_FIELDS: string[][] = [
  ["companyName", "website", "industry", "companySize"],
  ["regions", "targetCustomerTypes", "budgetMin", "budgetMax"],
  ["valueProposition", "description"],
];

export function OnboardingWizard({ defaultCompanyName }: { defaultCompanyName: string }) {
  const [step, setStep] = useState(0);
  const [state, action] = useActionState(completeOnboardingAction, initialFormState);

  const errorStepIndex = state.fieldErrors
    ? STEP_FIELDS.findIndex((fields) =>
        fields.some((field) => Boolean(state.fieldErrors?.[field]?.length)),
      )
    : -1;

  const isLast = step === STEPS.length - 1;
  const ActiveIcon = STEPS[step].icon;

  return (
    <div>
      <div className="mb-6 flex items-center gap-2" aria-label="Onboarding progress">
        {STEPS.map((item, index) => (
          <div key={item.title} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                index < step
                  ? "bg-brand text-white"
                  : index === step
                    ? "bg-brand-soft text-brand-dark ring-1 ring-brand/25"
                    : "bg-surface text-muted ring-1 ring-line",
              )}
            >
              {index + 1}
            </span>
            <span
              className={cn(
                "hidden text-[11px] font-semibold sm:block",
                index === step ? "text-ink" : "text-muted",
              )}
            >
              {item.title}
            </span>
            {index < STEPS.length - 1 ? (
              <span
                className={cn(
                  "h-px flex-1",
                  index < step ? "bg-brand/40" : "bg-line",
                )}
              />
            ) : null}
          </div>
        ))}
      </div>

      <div className="card p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark ring-1 ring-brand/10">
            <ActiveIcon className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 className="mt-0.5 font-display text-xl font-semibold text-ink">
              {STEPS[step].title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{STEPS[step].description}</p>
          </div>
        </div>

        <form action={action} className="mt-6" noValidate>
          {state.message ? (
            <div className="mb-5">
              <FormMessage status={state.status} message={state.message} />
            </div>
          ) : null}

          {errorStepIndex >= 0 && errorStepIndex !== step ? (
            <div className="mb-5">
              <FormMessage
                status="error"
                message={`Some details in step ${errorStepIndex + 1} need attention.`}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 px-0 text-brand hover:bg-transparent"
                onClick={() => setStep(errorStepIndex)}
              >
                Go to step {errorStepIndex + 1}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          ) : null}

          <div className={cn("space-y-5", step !== 0 && "hidden")}>
            <Field
              label="Company name"
              htmlFor="companyName"
              error={state.fieldErrors?.companyName?.[0]}
            >
              <TextInput
                id="companyName"
                name="companyName"
                defaultValue={defaultCompanyName}
                placeholder="Northstar Studio"
                aria-invalid={Boolean(state.fieldErrors?.companyName)}
              />
            </Field>

            <Field
              label="Website"
              htmlFor="website"
              hint="Include https://. Optional, but it helps research agents."
              error={state.fieldErrors?.website?.[0]}
            >
              <TextInput
                id="website"
                name="website"
                type="url"
                placeholder="https://example.com"
                aria-invalid={Boolean(state.fieldErrors?.website)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Industry"
                htmlFor="industry"
                error={state.fieldErrors?.industry?.[0]}
              >
                <Select
                  id="industry"
                  name="industry"
                  defaultValue=""
                  aria-invalid={Boolean(state.fieldErrors?.industry)}
                >
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

              <Field
                label="Company size"
                htmlFor="companySize"
                error={state.fieldErrors?.companySize?.[0]}
              >
                <Select
                  id="companySize"
                  name="companySize"
                  defaultValue=""
                  aria-invalid={Boolean(state.fieldErrors?.companySize)}
                >
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
          </div>

          <div className={cn("space-y-5", step !== 1 && "hidden")}>
            <Field
              label="Target regions"
              htmlFor="regions"
              hint="Countries, states, or cities, separated by commas."
              error={state.fieldErrors?.regions?.[0]}
            >
              <TextInput
                id="regions"
                name="regions"
                placeholder="United States, Canada, United Kingdom"
                aria-invalid={Boolean(state.fieldErrors?.regions)}
              />
            </Field>

            <Field
              label="Target customer types"
              htmlFor="targetCustomerTypes"
              hint="e.g. Founders, Heads of Operations, Marketing directors at mid-market firms."
              error={state.fieldErrors?.targetCustomerTypes?.[0]}
            >
              <TextInput
                id="targetCustomerTypes"
                name="targetCustomerTypes"
                placeholder="Operations leaders at growing logistics firms"
                aria-invalid={Boolean(state.fieldErrors?.targetCustomerTypes)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Minimum deal budget (USD)"
                htmlFor="budgetMin"
                hint="Optional. Whole dollars."
                error={state.fieldErrors?.budgetMin?.[0]}
              >
                <TextInput
                  id="budgetMin"
                  name="budgetMin"
                  type="number"
                  min={0}
                  step={100}
                  placeholder="5000"
                  aria-invalid={Boolean(state.fieldErrors?.budgetMin)}
                />
              </Field>
              <Field
                label="Maximum deal budget (USD)"
                htmlFor="budgetMax"
                hint="Optional. Whole dollars."
                error={state.fieldErrors?.budgetMax?.[0]}
              >
                <TextInput
                  id="budgetMax"
                  name="budgetMax"
                  type="number"
                  min={0}
                  step={100}
                  placeholder="50000"
                  aria-invalid={Boolean(state.fieldErrors?.budgetMax)}
                />
              </Field>
            </div>
          </div>

          <div className={cn("space-y-5", step !== 2 && "hidden")}>
            <Field
              label="What do you offer?"
              htmlFor="valueProposition"
              hint="One or two sentences the outreach agent can use as ground truth."
              error={state.fieldErrors?.valueProposition?.[0]}
            >
              <Textarea
                id="valueProposition"
                name="valueProposition"
                placeholder="We help logistics teams cut dispatch delays with a lightweight scheduling layer that plugs into their existing tools."
                aria-invalid={Boolean(state.fieldErrors?.valueProposition)}
              />
            </Field>

            <Field
              label="Anything else the agents should know?"
              htmlFor="description"
              hint="Optional. Ideal customer traits, disqualifiers, or constraints."
              error={state.fieldErrors?.description?.[0]}
            >
              <Textarea
                id="description"
                name="description"
                placeholder="Best fit: 20–200 employee freight brokers. Not a fit: companies without an in-house ops team."
                aria-invalid={Boolean(state.fieldErrors?.description)}
              />
            </Field>

            <div className="rounded-xl border border-line bg-canvas/70 px-4 py-3 text-xs leading-relaxed text-muted">
              <p className="font-semibold text-ink-soft">What happens next</p>
              <p className="mt-1">
                Your workspace is marked ready and the dashboard unlocks. Agents only run when
                you start them, and no outreach is sent without approval.
              </p>
            </div>
          </div>

          <div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              disabled={step === 0}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Button>

            {isLast ? (
              <SubmitButton pendingLabel="Setting up workspace…">
                Finish setup
                <ArrowRight className="size-4" aria-hidden="true" />
              </SubmitButton>
            ) : (
              <Button
                type="button"
                onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
              >
                Continue
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </form>
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
        You can change all of this later in Settings. LeadPilot never invents company or
        contact details to fill gaps.
      </p>
    </div>
  );
}
