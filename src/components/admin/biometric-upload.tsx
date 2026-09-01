"use client";

import { useState } from "react";
import { Upload, AlertTriangle, CheckCircle2 } from "lucide-react";

import { parseBiometricExport, manilaDate, type ParsedPunch } from "@/lib/biometric/parse";

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
  auto_matched?: {
    biometric_id: number;
    device_name: string | null;
    user_id: string;
    full_name: string;
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

/** What period does this file cover, and how many people are in it? */
function summarise(rows: ParsedRow[]) {
  if (rows.length === 0) return null;
  const dates = rows.map((r) => manilaDate(r.punch_time)).sort();
  return {
    from: dates[0],
    to: dates[dates.length - 1],
    people: new Set(rows.map((r) => r.biometric_id)).size,
  };
}

/**
 * Rejections are per-punch, but the cause is per-person — one unmapped
 * enrolment number produces a row for every time they touched the door.
 * Collapsing to one line per number keeps the fix obvious.
 */
function groupRejections(errors: UploadResult["errors"]) {
  const by = new Map<number, { name: string | null; reason: string; count: number }>();
  for (const e of errors) {
    const held = by.get(e.biometric_id);
    if (held) held.count++;
    else by.set(e.biometric_id, { name: e.name, reason: e.reason, count: 1 });
  }
  return [...by.entries()].sort((a, b) => b[1].count - a[1].count);
}

export function BiometricUpload() {
  const [filename, setFilename] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summary = summarise(parsed);

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
                {summary && (
                  <>
                    {" · "}
                    {summary.people} {summary.people === 1 ? "person" : "people"}
                    {" · "}
                    {summary.from === summary.to
                      ? summary.from
                      : `${summary.from} → ${summary.to}`}
                  </>
                )}
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
          {(result.auto_matched?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-900">
                <CheckCircle2 size={14} />
                {result.auto_matched!.length} enrolment number
                {result.auto_matched!.length !== 1 ? "s" : ""} matched
                automatically
              </p>
              <p className="mb-3 text-xs text-blue-800">
                These numbers weren&apos;t on any profile, but the name on the
                device matched exactly one person who didn&apos;t already have
                one — so their punches were kept instead of discarded. Check
                them: if any is wrong, clear the Biometric ID on that profile.
              </p>
              <ul className="space-y-0.5 text-xs text-blue-900">
                {result.auto_matched!.map((m) => (
                  <li key={m.biometric_id}>
                    · <strong>#{m.biometric_id}</strong> &ldquo;{m.device_name}
                    &rdquo; → {m.full_name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-yellow-900">
                <AlertTriangle size={14} /> {result.errors.length} row
                {result.errors.length !== 1 ? "s" : ""} rejected
              </p>
              <p className="mb-3 text-xs text-yellow-800">
                Grouped by enrolment number — each of these is one person, not
                one punch. These couldn&apos;t be matched automatically, either
                because the device name matches nobody, or because it matches
                more than one person who has no number yet. Set the Biometric
                ID on the right profile and re-upload this same file;
                already-stored punches are skipped as duplicates.
              </p>
              <table className="w-full text-xs">
                <thead className="text-left">
                  <tr className="text-yellow-900">
                    <th className="py-1 pr-3 font-medium">EnNo</th>
                    <th className="py-1 pr-3 font-medium">Name on device</th>
                    <th className="py-1 pr-3 font-medium">Punches</th>
                    <th className="py-1 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {groupRejections(result.errors).map(([id, info]) => (
                    <tr key={id} className="border-t border-yellow-100">
                      <td className="py-1 pr-3 font-medium text-yellow-900">{id}</td>
                      <td className="py-1 pr-3 text-yellow-900">{info.name ?? "—"}</td>
                      <td className="py-1 pr-3 text-yellow-800">{info.count}</td>
                      <td className="py-1 text-yellow-800">{info.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
