"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Users, Calendar } from "lucide-react";

interface ProgressState {
  phase: string;
  current: number;
  total: number;
  message: string;
}

interface ImportResult {
  usersCreated: number;
  usersUpdated: number;
  schedulesCreated?: number;
  managersLinked: number;
  errors: string[];
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

function ResultDisplay({ result, type }: { result: ImportResult; type: "users" | "schedules" }) {
  return (
    <div className="mt-4 space-y-2 rounded-lg bg-green-50 p-4">
      <p className="font-medium text-green-800">Import complete</p>
      <div className={`grid gap-2 text-sm text-green-700 ${type === "schedules" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        <div>
          <span className="font-bold">{result.usersCreated}</span> created
        </div>
        <div>
          <span className="font-bold">{result.usersUpdated}</span> updated
        </div>
        {type === "schedules" && (
          <div>
            <span className="font-bold">{result.schedulesCreated}</span> schedules
          </div>
        )}
        <div>
          <span className="font-bold">{result.managersLinked}</span> managers linked
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
  );
}

async function streamImport(
  url: string,
  file: File,
  onProgress: (p: ProgressState) => void,
): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(url, { method: "POST", body: formData });

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

function ImportSection({
  title,
  description,
  icon: Icon,
  apiUrl,
  type,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ size: number }>;
  apiUrl: string;
  type: "users" | "schedules";
}) {
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
      const data = await streamImport(apiUrl, file, setProgress);
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
            <Icon size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600">{description}</p>
          </div>
        </div>
        <label className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white ${importing ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}>
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

      {importing && progress && <ProgressBar progress={progress} />}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && <ResultDisplay result={result} type={type} />}
    </div>
  );
}

export function CsvImport() {
  return (
    <div className="space-y-4">
      <ImportSection
        title="Import Users"
        description="CSV columns: Name, Email, Timezone, Department, Manager Name, Holiday Country, DeskTime ID"
        icon={Users}
        apiUrl="/api/admin/import-users"
        type="users"
      />
      <ImportSection
        title="Import Schedules"
        description="CSV columns: Person, Email, Time Zone, M, T, W, TH, F, Manager Name"
        icon={Calendar}
        apiUrl="/api/admin/import-csv"
        type="schedules"
      />
    </div>
  );
}
