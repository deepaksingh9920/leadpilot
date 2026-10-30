import { Check, Lock, ShieldCheck } from "lucide-react";

const steps = [
  {
    agent: "Lead Finder",
    state: "Complete",
    tone: "success" as const,
    detail: "42 sourced companies · 3 permitted sources",
  },
  {
    agent: "Company Research",
    state: "Complete",
    tone: "success" as const,
    detail: "Source pages stored for every summary",
  },
  {
    agent: "Lead Qualification",
    state: "Running",
    tone: "brand" as const,
    detail: "Scoring fit and data confidence…",
  },
  {
    agent: "Email Outreach",
    state: "Needs approval",
    tone: "warning" as const,
    detail: "Drafts wait for a human decision",
  },
];

const toneClasses = {
  success: "bg-success-soft text-success border-success/15",
  brand: "bg-brand-soft text-brand-dark border-brand/15",
  warning: "bg-warning-soft text-warning border-warning/15",
};

/**
 * Illustrative product interface. It intentionally contains no invented company
 * names, emails, phone numbers, or sources — only generic step labels.
 */
export function ProductPreview() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand/10 via-transparent to-accent/10 blur-2xl"
      />
      <div className="card overflow-hidden shadow-lift">
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Agent run · illustrative
          </span>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-2.5">
            {steps.map((step) => (
              <div
                key={step.agent}
                className="rounded-xl border border-line bg-canvas/60 px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-ink">{step.agent}</p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClasses[step.tone]}`}
                  >
                    {step.state}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{step.detail}</p>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full ${
                      step.tone === "success"
                        ? "w-full bg-success"
                        : step.tone === "brand"
                          ? "w-2/3 bg-brand"
                          : "w-1/3 bg-warning"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-line bg-surface p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Evidence attached
              </div>
              <div className="mt-3 space-y-2.5">
                {["Company", "Website", "Contact", "Source"].map((label, index) => (
                  <div key={label}>
                    <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                      {label}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <div
                        className="h-2 rounded-full bg-line"
                        style={{ width: `${64 - index * 8}%` }}
                      />
                      <Check className="size-3 text-success" aria-hidden="true" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-brand/15 bg-brand-soft p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-dark">
                <Lock className="size-3.5" aria-hidden="true" />
                Sending stays locked
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-brand-dark/75">
                Nothing leaves your workspace until an admin approves the exact draft.
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Usage
              </p>
              <div className="mt-2 flex items-baseline justify-between text-[11px] text-muted">
                <span>Agent runs</span>
                <span className="font-semibold text-ink">Illustrative</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full w-[38%] rounded-full bg-accent" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
