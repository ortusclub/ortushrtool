"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

interface ImportResult {
  usersCreated: number;
  usersUpdated: number;
  schedulesCreated: number;
  managersLinked: number;
  errors: string[];
}

export function CsvImport() {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/admin/import-csv", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        setError(err.error || "Import failed");
        return;
      }

      const data: ImportResult = await response.json();
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      // Reset input
      e.target.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">
            Import Schedules from CSV
          </h3>
          <p className="text-sm text-gray-600">
            Upload a CSV with columns: Person, Email, Time Zone, M, T, W, TH, F,
            Manager Name
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Upload size={16} />
          {importing ? "Importing..." : "Upload CSV"}
          <input
            type="file"
            accept=".csv"
            onChange={handleImport}
            disabled={importing}
            className="hidden"
          />
        </label>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-2 rounded-lg bg-green-50 p-4">
          <p className="font-medium text-green-800">Import complete</p>
          <div className="grid grid-cols-2 gap-2 text-sm text-green-700 sm:grid-cols-4">
            <div>
              <span className="font-bold">{result.usersCreated}</span> users
              created
            </div>
            <div>
              <span className="font-bold">{result.usersUpdated}</span> users
              updated
            </div>
            <div>
              <span className="font-bold">{result.schedulesCreated}</span>{" "}
              schedules
            </div>
            <div>
              <span className="font-bold">{result.managersLinked}</span>{" "}
              managers linked
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 space-y-1 text-sm text-red-600">
              <p className="font-medium">Errors:</p>
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
