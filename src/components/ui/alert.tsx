import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger" | "shield";

const styles: Record<Tone, { wrap: string; icon: ReactNode }> = {
  info: {
    wrap: "border-brand/15 bg-brand-soft text-brand-dark",
    icon: <Info className="size-4 shrink-0" aria-hidden="true" />,
  },
  success: {
    wrap: "border-success/15 bg-success-soft text-success",
    icon: <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />,
  },
  warning: {
    wrap: "border-warning/20 bg-warning-soft text-warning",
    icon: <AlertCircle className="size-4 shrink-0" aria-hidden="true" />,
  },
  danger: {
    wrap: "border-danger/20 bg-danger-soft text-danger",
    icon: <AlertCircle className="size-4 shrink-0" aria-hidden="true" />,
  },
  shield: {
    wrap: "border-success/15 bg-success-soft text-success",
    icon: <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />,
  },
};

export function Alert({
  children,
  tone = "info",
  title,
  className,
}: {
  children?: ReactNode;
  tone?: Tone;
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed",
        styles[tone].wrap,
        className,
      )}
      role={tone === "danger" ? "alert" : "status"}
    >
      <span className="mt-0.5">{styles[tone].icon}</span>
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
      </div>
    </div>
  );
}
