"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Download, Users } from "lucide-react";

interface ProgressState {
  phase: string;
  current: number;
  total: number;
  message: string;
}

interface ImportResult {
  usersCreated: number;
  usersUpdated: number;
  schedulesCreated: number;
  managersLinked: number;
  errors: string[];
}

const SAMPLE_CSV = `Name,Email,Timezone,Department,Manager Name,Country,Desktime ID,M,T,W,TH,F
Juan Dela Cruz,juan@ortusclub.com,PHT,Operations,Maria Santos,PH,12345,Office - 09:00 - 18:00,Office - 09:00 - 18:00,Office - 09:00 - 18:00,Office - 09:00 - 18:00,Office - 09:00 - 18:00
Maria Santos,maria@ortusclub.com,CET,Operations,,IT,,Online - 10:00 - 19:00,Online - 10:00 - 19:00,Online - 10:00 - 19:00,Online - 10:00 - 19:00,Online - 10:00 - 19:00`;

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "import-users-sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function ProgressBar({ progress }: { progress: ProgressState }) {
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const phaseLabel =
    progress.phase === "users" ? "Importing users" :
    progress.phase === "managers" ? "Linking managers" :
    progress.phase === "schedules" ? "Creating schedules" : progress.phase;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{phaseLabel}</span>
        <span className="text-gray-500">{progress.current}/{progress.total} ({percent}%)</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">{progress.message}</p>
    </div>
  );
}

async function streamImport(
  file: File,
  onProgress: (p: ProgressState) => void,
): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/admin/import-csv", { method: "POST", body: formData });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Import failed");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ImportResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const data = JSON.parse(line);
      if (data.type === "progress") {
        onProgress(data as ProgressState);
      } else if (data.type === "done") {
        finalResult = data as ImportResult;
      }
    }
  }

  if (!finalResult) throw new Error("Import ended without results");
  return finalResult;
}

export function CsvImport() {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError("");
    setResult(null);
    setProgress(null);

    try {
      const data = await streamImport(file, setProgress);
      setResult(data);
      setProgress(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setProgress(null);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
            <Users size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Import Users</h3>
            <p className="text-sm text-gray-600">
              Upload a CSV to create new users or update existing ones (matched by email).
              Schedule columns (M–F) are optional.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Columns: Name, Email, Timezone, Department, Manager Name, Country, Desktime ID, M, T, W, TH, F
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadSample}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-95"
          >
            <Download size={14} />
            Sample
          </button>
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-all active:scale-95 ${importing ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}>
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
      </div>

      {importing && progress && <ProgressBar progress={progress} />}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-2 rounded-lg bg-green-50 p-4">
          <p className="font-medium text-green-800">Import complete</p>
          <div className="grid grid-cols-2 gap-2 text-sm text-green-700 sm:grid-cols-4">
            <div><span className="font-bold">{result.usersCreated}</span> created</div>
            <div><span className="font-bold">{result.usersUpdated}</span> updated</div>
            <div><span className="font-bold">{result.schedulesCreated}</span> schedules</div>
            <div><span className="font-bold">{result.managersLinked}</span> managers linked</div>
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
