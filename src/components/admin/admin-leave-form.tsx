"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function AdminLeaveForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [leaveType, setLeaveType] = useState("annual");
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [viewMonth, setViewMonth] = useState(() => new Date());

  const leaveTypes = [
    { value: "annual", label: "Annual Leave" },
    { value: "sick", label: "Sick Leave" },
    { value: "personal", label: "Personal Leave" },
    { value: "unpaid", label: "Unpaid Leave" },
    { value: "other", label: "Other" },
  ];

  // Build calendar grid for the current view month
  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Start from Monday
    let startOffset = (firstDay.getDay() + 6) % 7;
    const days: { date: string; day: number; isCurrentMonth: boolean; isWeekend: boolean }[] = [];

    // Fill previous month days
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({
        date: d.toISOString().split("T")[0],
        day: d.getDate(),
        isCurrentMonth: false,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      });
    }

    // Fill current month days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({
        date: date.toISOString().split("T")[0],
        day: d,
        isCurrentMonth: true,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      });
    }

    // Fill next month days to complete the grid
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d);
      days.push({
        date: date.toISOString().split("T")[0],
        day: d,
        isCurrentMonth: false,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      });
    }

    return days;
  }, [viewMonth]);

  const toggleDay = (date: string) => {
    const next = new Set(selectedDays);
    if (next.has(date)) {
      next.delete(date);
    } else {
      next.add(date);
    }
    setSelectedDays(next);
  };

  const prevMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  };

  const monthLabel = viewMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const sortedSelected = Array.from(selectedDays).sort();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDays.size === 0) {
      setMessage("Please select at least one day on the calendar.");
      return;
    }

    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const currentUser = (await supabase.auth.getUser()).data.user;

    // Find contiguous ranges to create fewer leave entries
    const dates = sortedSelected;
    const ranges: { start: string; end: string }[] = [];
    let rangeStart = dates[0];
    let rangeEnd = dates[0];

    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(rangeEnd + "T00:00:00");
      const curr = new Date(dates[i] + "T00:00:00");
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

      // Allow gaps of weekends (1-3 days gap is ok if bridging a weekend)
      if (diffDays <= 3) {
        rangeEnd = dates[i];
      } else {
        ranges.push({ start: rangeStart, end: rangeEnd });
        rangeStart = dates[i];
        rangeEnd = dates[i];
      }
    }
    ranges.push({ start: rangeStart, end: rangeEnd });

    let errors = 0;
    for (const range of ranges) {
      const { error } = await supabase.from("leave_requests").insert({
        employee_id: userId,
        leave_type: leaveType,
        start_date: range.start,
        end_date: range.end,
        reason: reason || "Admin-added leave",
        status: "approved",
        reviewed_by: currentUser?.id,
        reviewed_at: new Date().toISOString(),
      });
      if (error) errors++;
    }

    if (errors > 0) {
      setMessage(`Created with ${errors} error(s).`);
    } else {
      setMessage(
        `Leave added for ${selectedDays.size} day(s) across ${ranges.length} period(s) — auto-approved.`
      );
      setSelectedDays(new Set());
      setReason("");
    }

    setSaving(false);
    router.refresh();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-purple-200 bg-white p-6 space-y-4"
    >
      <p className="text-sm text-gray-600">
        Select the days this person will be on leave. Click individual days on
        the calendar below.
      </p>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Leave type
        </label>
        <select
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          {leaveTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Calendar */}
      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded p-1 hover:bg-gray-100"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-gray-900">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded p-1 hover:bg-gray-100"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div
              key={d}
              className="text-xs font-medium text-gray-500 py-1"
            >
              {d}
            </div>
          ))}
          {calendarDays.map(({ date, day, isCurrentMonth, isWeekend }) => {
            const isSelected = selectedDays.has(date);
            const today = new Date().toISOString().split("T")[0];
            const isPast = date < today;

            return (
              <button
                key={date}
                type="button"
                onClick={() => !isPast && !isWeekend && toggleDay(date)}
                disabled={isPast || isWeekend}
                className={`rounded-lg py-1.5 text-xs transition-colors ${
                  isSelected
                    ? "bg-purple-600 text-white font-bold"
                    : isWeekend
                      ? "text-gray-300 cursor-not-allowed"
                      : isPast
                        ? "text-gray-300 cursor-not-allowed"
                        : isCurrentMonth
                          ? "text-gray-700 hover:bg-purple-100"
                          : "text-gray-300 hover:bg-gray-50"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDays.size > 0 && (
        <div className="rounded-lg bg-purple-50 p-3">
          <p className="text-sm font-medium text-purple-800">
            {selectedDays.size} day(s) selected
          </p>
          <p className="text-xs text-purple-600 mt-1">
            {sortedSelected
              .map((d) => {
                const date = new Date(d + "T00:00:00");
                return `${date.getDate()}/${date.getMonth() + 1}`;
              })
              .join(", ")}
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Reason (optional)
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Vacation, medical appointment..."
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.includes("error")
              ? "bg-red-50 text-red-700"
              : "bg-green-50 text-green-700"
          }`}
        >
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={saving || selectedDays.size === 0}
        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Submit Leave"}
      </button>
    </form>
  );
}
