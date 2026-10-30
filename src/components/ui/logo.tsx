import Link from "next/link";

import { cn } from "@/lib/utils";

export function Logo({
  href = "/",
  compact = false,
  inverted = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="LeadPilot home"
      className={cn("inline-flex items-center gap-2.5", className)}
    >
      <span
        className={cn(
          "relative flex size-9 items-center justify-center rounded-[11px] shadow-sm",
          inverted ? "bg-white/10 ring-1 ring-white/20" : "bg-brand",
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
          <path
            d="M12 2.75 20 21l-8-4.25L4 21 12 2.75Z"
            fill={inverted ? "#ffffff" : "#ffffff"}
          />
          <path d="M12 8.2v8.55l4.15 2.2L12 8.2Z" fill="#fbbf24" />
        </svg>
      </span>
      {!compact ? (
        <span
          className={cn(
            "font-display text-[19px] font-semibold tracking-[-0.03em]",
            inverted ? "text-white" : "text-ink",
          )}
        >
          LeadPilot
        </span>
      ) : null}
    </Link>
  );
}
