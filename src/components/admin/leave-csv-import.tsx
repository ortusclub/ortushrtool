"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Download } from "lucide-react";

interface ImportResult {
  created: number;
  skipped: number;
  duplicates_skipped: number;
  errors: string[];
}

const SAMPLE_CSV = `Email,Leave Type,Start Date,End Date,Duration,Reason
OPTIONS:,(annual / birthday / cto / trinity / anniversary / maternity_paternity / solo_parent / bereavement),(YYYY-MM-DD),(YYYY-MM-DD),(full_day / half_day_am / half_day_pm),(free text)
juan@ortusclub.com,annual,2026-05-01,2026-05-02,full_day,Family vacation
maria@ortusclub.com,birthday,2026-06-15,2026-06-15,full_day,Birthday leave
pedro@ortusclub.com,cto,2026-05-10,2026-05-10,half_day_am,Morning appointment`;

export function LeaveCsvImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [autoApprove, setAutoApprove] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-leaves-sample.csv";
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
      formData.append("auto_approve", autoApprove ? "true" : "false");

      const response = await fetch("/api/admin/import-leaves", {
        method: "POST",
        body: formData,
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server error (${response.status}): ${text.slice(0, 200)}`);
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
          <h3 className="font-semibold text-gray-900">Bulk Leave Import</h3>
          <p className="text-sm text-gray-600">
            Upload a CSV to create leave requests for multiple employees at once.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Columns: Email, Leave Type, Start Date, End Date, Duration, Reason
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadSample}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <Download size={14} />
            Sample
          </button>
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm ${
              importing ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            <Upload size={16} />
            {importing ? "Importing..." : "Upload CSV"}
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

      <div className="mt-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
            className="rounded border-gray-300"
          />
          Auto-approve all imported leaves
        </label>
      </div>

      {importing && (
        <div className="mt-4 flex items-center gap-3 text-sm text-gray-600">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          Importing leaves...
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
            {result.created} leave{result.created !== 1 ? "s" : ""} created
            {autoApprove ? " (auto-approved)" : " (pending)"}.
            {result.duplicates_skipped > 0 &&
              ` ${result.duplicates_skipped} duplicate${result.duplicates_skipped !== 1 ? "s" : ""} skipped.`}
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
