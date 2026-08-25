"use client";

import { useState } from "react";
import { Upload, AlertTriangle, CheckCircle2 } from "lucide-react";

import { parseBiometricExport, type ParsedPunch } from "@/lib/biometric/parse";

type ParsedRow = ParsedPunch;

interface UploadResult {
  ok: boolean;
  received: number;
  inserted: number;
  skipped_duplicates: number;
  errors: {
    biometric_id: number;
    name: string | null;
    punch_time: string;
    reason: string;
  }[];
}

/**
 * The export format is parsed by the shared lib so this page, the scripted
 * ingest endpoint and the live device feed all read the scanner identically.
 */
function parseCsv(text: string): { rows: ParsedRow[]; parseErrors: string[] } {
  const { rows, errors } = parseBiometricExport(text);
  return { rows, parseErrors: errors };
}

export function BiometricUpload() {
  const [filename, setFilename] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setFilename(file.name);
    setResult(null);
    setError(null);
    const text = await file.text();
    const { rows, parseErrors } = parseCsv(text);
    setParsed(rows);
    setParseErrors(parseErrors);
  };

  const submit = async () => {
    if (parsed.length === 0) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/biometric-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: parsed.map((r) => ({
          biometric_id: r.biometric_id,
          name: r.name,
          punch_time: r.punch_time,
        })),
        source_filename: filename,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Upload failed");
      return;
    }
    const data: UploadResult = await res.json();
    setResult(data);
  };

  const reset = () => {
    setFilename(null);
    setParsed([]);
    setParseErrors([]);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {!filename && (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white p-8 text-sm text-gray-600 hover:border-blue-400 hover:bg-blue-50">
          <Upload size={18} />
          <span>Click to pick a biometric CSV file</span>
          <input
            type="file"
            accept=".csv,.txt,.tsv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </label>
      )}

      {filename && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{filename}</p>
              <p className="text-xs text-gray-500">
                {parsed.length} parsed row{parsed.length !== 1 ? "s" : ""}
                {parseErrors.length > 0 && (
                  <span className="ml-2 text-red-600">
                    · {parseErrors.length} parse error{parseErrors.length !== 1 ? "s" : ""}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={reset}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Pick another file
            </button>
          </div>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-red-800">
            <AlertTriangle size={14} /> Lines we couldn&apos;t parse
          </p>
          <ul className="space-y-0.5 text-xs text-red-700">
            {parseErrors.slice(0, 50).map((e, i) => (
              <li key={i}>· {e}</li>
            ))}
            {parseErrors.length > 50 && (
              <li className="italic">…and {parseErrors.length - 50} more</li>
            )}
          </ul>
        </div>
      )}

      {parsed.length > 0 && !result && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-2 text-sm font-medium text-gray-700">
              Preview (first 20 rows)
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-gray-600">EnNo</th>
                  <th className="px-3 py-2 font-medium text-gray-600">Name</th>
                  <th className="px-3 py-2 font-medium text-gray-600">Punch (PH local)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parsed.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-gray-700">{r.biometric_id}</td>
                    <td className="px-3 py-1.5 text-gray-700">{r.name}</td>
                    <td className="px-3 py-1.5 text-gray-500">{r.raw_datetime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 20 && (
              <div className="px-4 py-2 text-xs text-gray-500">
                …and {parsed.length - 20} more rows
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={submit}
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Uploading…" : `Upload ${parsed.length} punches`}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </>
      )}

      {result && (
        <div className="space-y-3">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-green-800">
              <CheckCircle2 size={16} />
              Inserted {result.inserted} of {result.received} rows
              {result.skipped_duplicates > 0 && (
                <span className="text-green-700">
                  · {result.skipped_duplicates} duplicate
                  {result.skipped_duplicates !== 1 ? "s" : ""} skipped
                </span>
              )}
            </p>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-yellow-900">
                <AlertTriangle size={14} /> {result.errors.length} row
                {result.errors.length !== 1 ? "s" : ""} rejected
              </p>
              <table className="w-full text-xs">
                <thead className="text-left">
                  <tr className="text-yellow-900">
                    <th className="py-1 pr-3 font-medium">EnNo</th>
                    <th className="py-1 pr-3 font-medium">Name</th>
                    <th className="py-1 pr-3 font-medium">Punch</th>
                    <th className="py-1 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.slice(0, 100).map((e, i) => (
                    <tr key={i} className="border-t border-yellow-100">
                      <td className="py-1 pr-3 text-yellow-900">{e.biometric_id}</td>
                      <td className="py-1 pr-3 text-yellow-900">{e.name}</td>
                      <td className="py-1 pr-3 text-yellow-800">{e.punch_time}</td>
                      <td className="py-1 text-yellow-800">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.errors.length > 100 && (
                <p className="mt-2 text-xs italic text-yellow-700">
                  …and {result.errors.length - 100} more
                </p>
              )}
            </div>
          )}
          <button
            onClick={reset}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Upload another file
          </button>
        </div>
      )}
    </div>
  );
}
