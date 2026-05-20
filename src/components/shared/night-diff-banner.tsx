import { Moon } from "lucide-react";

/**
 * Inline banner shown on adjustment-filing surfaces (schedule adjustment
 * form, weekly grid editor, one-off adjustment form) to make it obvious
 * to the requester that the schedule they're about to submit overlaps the
 * night-differential window (22:00–06:00). Callers decide eligibility via
 * `hasNightDifferentialHours` and only render this when applicable.
 */
export function NightDiffBanner({ message }: { message?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
      <Moon size={16} className="mt-0.5 shrink-0" />
      <p>
        {message ??
          "Heads up: this schedule overlaps night hours (22:00–06:00), so night differential will apply."}
      </p>
    </div>
  );
}
