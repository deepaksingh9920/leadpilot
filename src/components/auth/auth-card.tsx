import type { ReactNode } from "react";
import Link from "next/link";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
        {title}
      </h1>
      {description ? (
        <div className="mt-2 text-sm leading-relaxed text-muted">{description}</div>
      ) : null}
      <div className="mt-7">{children}</div>
      {footer ? (
        <div className="mt-6 border-t border-line pt-5 text-sm text-muted">{footer}</div>
      ) : null}
      <p className="mt-8 text-center text-[11px] leading-relaxed text-muted">
        By continuing you agree to the{" "}
        <Link href="/features#security" className="underline underline-offset-2 hover:text-ink">
          acceptable use policy
        </Link>{" "}
        and confirm you will only use permitted data sources.
      </p>
    </div>
  );
}
