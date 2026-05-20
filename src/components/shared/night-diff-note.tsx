import { Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small badge shown next to schedule times that fall into the night
 * differential window (22:00–06:00). Pure presentational — callers decide
 * eligibility via `hasNightDifferentialHours` and only render this when
 * the shift qualifies.
 */
export function NightDiffNote({
  size = "sm",
  className,
}: {
  size?: "xs" | "sm";
  className?: string;
}) {
  const text = size === "xs" ? "text-[10px]" : "text-xs";
  const icon = size === "xs" ? 10 : 12;
  return (
    <span
      title="Night differential eligible (shift overlaps 22:00–06:00)"
      className={cn(
        "inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700",
        text,
        className
      )}
    >
      <Moon size={icon} />
      Night diff applied
    </span>
  );
}
