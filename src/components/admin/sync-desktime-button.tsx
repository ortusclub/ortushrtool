"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

interface DayResult {
  date: string;
  success: boolean;
  synced?: number;
  skipped?: number;
  error?: string;
}

export function SyncDesktimeButton() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [results, setResults] = useState<DayResult[]>([]);

  const handleSync = async () => {
    setSyncing(true);
    setResults([]);
    setProgress("");

    // Build list of dates
    const dates: string[] = [];
    const current = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");

    while (current <= end) {
      dates.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`);
      current.setDate(current.getDate() + 1);
    }

    const dayResults: DayResult[] = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      setProgress(`Syncing ${date} (${i + 1}/${dates.length})...`);

      try {
        const response = await fetch("/api/admin/sync-desktime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date }),
        });
        const data = await response.json();
        dayResults.push({
          date,
          success: data.success ?? false,
          synced: data.synced,
          skipped: data.skipped,
          error: data.error,
        });
      } catch {
        dayResults.push({ date, success: false, error: "Request failed" });
      }

      setResults([...dayResults]);
    }

    setProgress("");
    setSyncing(false);
    router.refresh();
  };

  const totalSynced = results.reduce((sum, r) => sum + (r.synced ?? 0), 0);
  const totalDays = results.filter((r) => r.success).length;
  const failedDays = results.filter((r) => !r.success);

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600">
            From
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={syncing}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={syncing}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing..." : "Sync DeskTime"}
        </button>
      </div>

      {progress && (
        <p className="text-sm text-blue-600">{progress}</p>
      )}

      {results.length > 0 && !syncing && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <p className="font-medium">
            Synced {totalSynced} records across {totalDays} day(s)
          </p>
          {failedDays.length > 0 && (
            <p className="mt-1 text-red-600">
              {failedDays.length} day(s) failed:{" "}
              {failedDays.map((d) => d.date).join(", ")}
            </p>
          )}
        </div>
      )}

      {results.length > 0 && (
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">
            Show details ({results.length} days)
          </summary>
          <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
            {results.map((r) => (
              <div key={r.date} className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${r.success ? "bg-green-500" : "bg-red-500"}`}
                />
                <span>{r.date}</span>
                {r.success ? (
                  <span className="text-green-600">
                    {r.synced} synced, {r.skipped} skipped
                  </span>
                ) : (
                  <span className="text-red-600">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
