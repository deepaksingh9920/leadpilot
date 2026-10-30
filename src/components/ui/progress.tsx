import { cn, percentage } from "@/lib/utils";

export function Progress({
  used,
  limit,
  className,
  tone = "brand",
}: {
  used: number;
  limit: number;
  className?: string;
  tone?: "brand" | "warning" | "danger";
}) {
  const value = percentage(used, limit);
  const color =
    tone === "danger" || value >= 95
      ? "bg-danger"
      : tone === "warning" || value >= 75
        ? "bg-warning"
        : "bg-brand";

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={used}
      aria-label={`${used} of ${limit} used`}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", color)}
        style={{ width: `${Math.max(value, used > 0 ? 3 : 0)}%` }}
      />
    </div>
  );
}
