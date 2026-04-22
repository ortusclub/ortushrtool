"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Download } from "lucide-react";

interface User {
  id: string;
  full_name: string;
  email: string;
}

interface Schedule {
  employee_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_rest_day: boolean;
  work_location: string;
}

interface ImportResult {
  updated: number;
  skipped: number;
  errors: string[];
}

function formatScheduleCell(s: Schedule | undefined): string {
  if (!s) return "";
  if (s.is_rest_day) return "Rest";
  const loc = s.work_location === "online" ? "Online" : "Office";
  return `${loc} - ${s.start_time.slice(0, 5)} - ${s.end_time.slice(0, 5)}`;
}

export function ScheduleCsvImport({
  users,
  schedules,
}: {
  users: User[];
  schedules: Schedule[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const downloadCsv = () => {
    // Build schedule map: userId -> dayOfWeek -> Schedule
    const schedMap = new Map<string, Map<number, Schedule>>();
    for (const s of schedules) {
      if (!schedMap.has(s.employee_id)) schedMap.set(s.employee_id, new Map());
      schedMap.get(s.employee_id)!.set(s.day_of_week, s);
    }

    const headers = ["Name", "Email", "M", "T", "W", "TH", "F"];
    const csvRows = [headers.join(",")];

    for (const u of users) {
      const userSched = schedMap.get(u.id);
      csvRows.push(
        [
          `"${u.full_name ?? ""}"`,
          u.email,
          formatScheduleCell(userSched?.get(0)),
          formatScheduleCell(userSched?.get(1)),
          formatScheduleCell(userSched?.get(2)),
          formatScheduleCell(userSched?.get(3)),
          formatScheduleCell(userSched?.get(4)),
        ].join(",")
      );
    }

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedules-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/import-schedules", {
        method: "POST",
        body: formData,
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Server error (${response.status}): ${text.slice(0, 200)}`
        );
      }

      if (!response.ok) {
        throw new Error(data.error || "Import failed");
      }

      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Bulk Schedule Update</h3>
          <p className="text-sm text-gray-600">
            Download current schedules, edit in a spreadsheet, and re-upload.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Format: <code className="rounded bg-gray-100 px-1">Email, M, T, W, TH, F</code> —
            values like <code className="rounded bg-gray-100 px-1">Office - 09:00 - 18:00</code>,{" "}
            <code className="rounded bg-gray-100 px-1">Online - 10:00 - 19:00</code>, or{" "}
            <code className="rounded bg-gray-100 px-1">Rest</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadCsv}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <Download size={14} />
            Download
          </button>
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm ${
              importing
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            <Upload size={16} />
            {importing ? "Uploading..." : "Upload CSV"}
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleImport}
              disabled={importing}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {importing && (
        <div className="mt-4 flex items-center gap-3 text-sm text-gray-600">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          Updating schedules...
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg bg-green-50 p-4">
          <p className="font-medium text-green-800">
            {result.updated} schedule{result.updated !== 1 ? "s" : ""} updated.
            {result.skipped > 0 && ` ${result.skipped} skipped.`}
          </p>
          {result.errors.length > 0 && (
            <div className="mt-2 space-y-1 text-sm text-red-600">
              {result.errors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
