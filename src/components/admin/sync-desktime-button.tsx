"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function SyncDesktimeButton() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  });
  const [result, setResult] = useState<{
    success?: boolean;
    synced?: number;
    skipped?: number;
    error?: string;
  } | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/sync-desktime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await response.json();
      setResult(data);
      router.refresh();
    } catch {
      setResult({ error: "Sync request failed" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <label className="block text-xs font-medium text-gray-600">
          Sync Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
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
      {result && (
        <div className="text-sm">
          {result.success ? (
            <span className="text-green-700">
              Synced {result.synced} employees ({result.skipped} skipped)
            </span>
          ) : (
            <span className="text-red-700">{result.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
