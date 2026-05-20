"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, X, MapPin } from "lucide-react";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { formatTime } from "@/lib/utils";

type Row = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_rest_day: boolean;
  work_location: string;
};

type DayState = {
  id: string;
  start_time: string;
  end_time: string;
  is_rest_day: boolean;
  work_location: string;
};

export function WeeklyScheduleEditor({
  employeeId,
  schedules,
  canEdit,
  submitMode,
  defaultEditing = false,
  onSubmitted,
}: {
  employeeId: string;
  schedules: Row[];
  canEdit: boolean;
  submitMode: "direct" | "queue";
  defaultEditing?: boolean;
  onSubmitted?: (queued: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(defaultEditing);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  const buildInitial = () => {
    const m: Record<number, DayState> = {};
    for (let d = 0; d < 7; d++) {
      const existing = schedules.find((s) => s.day_of_week === d);
      m[d] = existing
        ? {
            id: existing.id,
            start_time: existing.start_time.slice(0, 5),
            end_time: existing.end_time.slice(0, 5),
            is_rest_day: existing.is_rest_day,
            work_location: existing.work_location,
          }
        : {
            id: "",
            start_time: "09:00",
            end_time: "18:00",
            is_rest_day: d === 0 || d === 6,
            work_location: "office",
          };
    }
    return m;
  };
  const [days, setDays] = useState<Record<number, DayState>>(buildInitial);

  const updateDay = (
    dayIdx: number,
    field: keyof DayState,
    value: string | boolean
  ) => {
    setDays((prev) => ({
      ...prev,
      [dayIdx]: { ...prev[dayIdx], [field]: value },
    }));
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setQueued(false);
    const payload = {
      employee_id: employeeId,
      days: Object.entries(days).map(([d, s]) => ({
        day_of_week: parseInt(d),
        start_time: s.start_time,
        end_time: s.end_time,
        is_rest_day: s.is_rest_day,
        work_location: s.work_location,
        ...(s.id ? { schedule_id: s.id } : {}),
      })),
    };
    const res = await fetch("/api/schedules/weekly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Save failed");
      return;
    }
    setEditing(false);
    if (data.queued) {
      setQueued(true);
    } else {
      router.refresh();
    }
    onSubmitted?.(Boolean(data.queued));
  };

  const cancel = () => {
    setDays(buildInitial());
    setEditing(false);
    setError(null);
  };

  if (!editing) {
    return (
      <div className="space-y-3">
        {queued && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Weekly schedule change submitted for admin approval.
          </p>
        )}
        <div className="flex items-center justify-end">
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil size={12} />
              {submitMode === "queue" ? "Request change" : "Edit"}
            </button>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {DAYS_OF_WEEK.map((dayName, idx) => {
            const day = days[idx];
            return (
              <div
                key={idx}
                className={`rounded-lg border p-3 ${
                  day.is_rest_day
                    ? "border-gray-100 bg-gray-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{dayName}</p>
                {day.is_rest_day ? (
                  <p className="mt-1 text-xs text-gray-400">Rest Day</p>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatTime(day.start_time)} – {formatTime(day.end_time)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                      <MapPin size={12} />
                      {day.work_location === "office" ? "Office" : "Online"}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th className="w-28 px-3 py-2 font-medium text-gray-600">Day</th>
              <th className="w-28 px-3 py-2 font-medium text-gray-600">Working Location</th>
              <th className="w-28 px-3 py-2 font-medium text-gray-600">Start</th>
              <th className="w-28 px-3 py-2 font-medium text-gray-600">End</th>
              <th className="w-24 px-3 py-2 font-medium text-gray-600">Rest day</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {DAYS_OF_WEEK.map((dayName, idx) => {
              const day = days[idx];
              return (
                <tr
                  key={idx}
                  className={day.is_rest_day ? "bg-gray-50" : "hover:bg-gray-50"}
                >
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {dayName}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={day.work_location}
                      onChange={(e) =>
                        updateDay(idx, "work_location", e.target.value)
                      }
                      disabled={!canEdit || day.is_rest_day}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value="office">Office</option>
                      <option value="online">Online</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={day.start_time}
                      onChange={(e) =>
                        updateDay(idx, "start_time", e.target.value)
                      }
                      disabled={!canEdit || day.is_rest_day}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={day.end_time}
                      onChange={(e) =>
                        updateDay(idx, "end_time", e.target.value)
                      }
                      disabled={!canEdit || day.is_rest_day}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={day.is_rest_day}
                      onChange={(e) =>
                        updateDay(idx, "is_rest_day", e.target.checked)
                      }
                      disabled={!canEdit}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={14} />
            {busy
              ? "Saving..."
              : submitMode === "queue"
                ? "Submit change request"
                : "Save changes"}
          </button>
          {!defaultEditing && (
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <X size={14} /> Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
