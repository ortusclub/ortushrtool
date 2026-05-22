"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import type {
  ProfileField,
  ProfileFieldSection,
} from "@/types/database";
import { AUTO_POPULATED_BUILT_IN_KEYS } from "@/lib/profile-fields";

type Result = {
  rowsProcessed: number;
  rowsUpdated: number;
  cellsWritten: number;
  unknownEmails: string[];
  unknownColumns: string[];
  autoPopulatedColumns: string[];
  errors: string[];
  pending?: boolean;
  pending_change_id?: string;
};

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function BulkImportForm({
  sections,
  fields,
}: {
  sections: ProfileFieldSection[];
  fields: ProfileField[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // For each multi-row field that's ticked, which of its sub-fields to
  // include in the template. Default = all sub-fields when a field is
  // first selected. Each CSV row appends one new entry per field; no row
  // indices in the template (no "Rows per person" — keeps imports small
  // and append-only).
  //
  // TODO(later): if a sub-field is configured as a natural key (e.g.
  // effective_date on Salary History), match existing rows by that key
  // and update instead of appending — enabling bulk updates via the
  // same template shape.
  const [selectedSubfields, setSelectedSubfields] = useState<
    Record<string, Set<string>>
  >({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fieldsBySection = useMemo(() => {
    const m = new Map<string, ProfileField[]>();
    for (const f of fields) {
      if (AUTO_POPULATED_BUILT_IN_KEYS.has(f.built_in_key ?? "")) continue;
      if (!m.has(f.section_id)) m.set(f.section_id, []);
      m.get(f.section_id)!.push(f);
    }
    for (const list of m.values()) list.sort((a, b) => a.sort_order - b.sort_order);
    return m;
  }, [fields]);

  // Sections that actually have at least one custom field
  const visibleSections = sections.filter(
    (s) => (fieldsBySection.get(s.id) ?? []).length > 0
  );

  const fieldById = useMemo(() => {
    const m = new Map<string, ProfileField>();
    for (const f of fields) m.set(f.id, f);
    return m;
  }, [fields]);

  const defaultSubfieldsFor = (f: ProfileField): Set<string> =>
    new Set((f.subfields ?? []).map((s) => s.key));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        const f = fieldById.get(id);
        if (f?.field_type === "multi_row" && !selectedSubfields[id]) {
          setSelectedSubfields((sf) => ({ ...sf, [id]: defaultSubfieldsFor(f) }));
        }
      }
      return next;
    });

  const toggleSubfield = (fieldId: string, subKey: string) =>
    setSelectedSubfields((prev) => {
      const current = new Set(prev[fieldId] ?? []);
      if (current.has(subKey)) current.delete(subKey);
      else current.add(subKey);
      return { ...prev, [fieldId]: current };
    });

  const selectAllInSection = (sectionId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of fieldsBySection.get(sectionId) ?? []) {
        next.add(f.id);
        if (f.field_type === "multi_row" && !selectedSubfields[f.id]) {
          setSelectedSubfields((sf) => ({
            ...sf,
            [f.id]: defaultSubfieldsFor(f),
          }));
        }
      }
      return next;
    });

  const clearAllInSection = (sectionId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of fieldsBySection.get(sectionId) ?? []) next.delete(f.id);
      return next;
    });

  const orderedSelectedFields = useMemo(() => {
    const out: ProfileField[] = [];
    for (const s of visibleSections) {
      for (const f of fieldsBySection.get(s.id) ?? []) {
        if (!selected.has(f.id)) continue;
        // Multi-row fields with zero ticked sub-fields produce no
        // template columns, so treat them as not-selected.
        if (
          f.field_type === "multi_row" &&
          (selectedSubfields[f.id]?.size ?? 0) === 0
        ) {
          continue;
        }
        out.push(f);
      }
    }
    return out;
  }, [visibleSections, fieldsBySection, selected, selectedSubfields]);

  const downloadTemplate = () => {
    if (orderedSelectedFields.length === 0) return;
    const headers: string[] = ["Email"];
    for (const f of orderedSelectedFields) {
      if (f.field_type === "multi_row") {
        const picked = selectedSubfields[f.id] ?? new Set<string>();
        for (const sf of f.subfields ?? []) {
          if (picked.has(sf.key)) headers.push(`${f.label} ${sf.label}`);
        }
      } else {
        headers.push(f.label);
      }
    }
    const csv = headers.map(csvEscape).join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk-import-template-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setResult(null);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/bulk-import", {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Import failed");
    } else {
      setResult(data as Result);
      router.refresh();
    }
    setImporting(false);
    e.target.value = "";
  };

  if (visibleSections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        No custom fields exist yet.{" "}
        <a
          href="/admin/settings/fields"
          className="text-blue-600 hover:underline"
        >
          Define some in Field Management
        </a>{" "}
        first, then come back here to bulk-import data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-medium">How it works</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Tick the fields you want to import data for this run — built-in or custom. For multi-row fields (e.g. salary history), also pick which sub-fields to include.</li>
          <li>Click <strong>Download template</strong>. You&apos;ll get a CSV with <code>Email</code> + your chosen columns.</li>
          <li>Fill it in offline. Leave a cell blank to skip it (won&apos;t overwrite existing values).</li>
          <li>Click <strong>Upload CSV</strong>. Scalar fields upsert by email; multi-row fields <strong>append a new entry</strong> per CSV row.</li>
        </ol>
        <p className="mt-2 text-xs">
          Built-in fields are validated: dates need <code>YYYY-MM-DD</code>, booleans
          accept <code>Yes/No</code>, role and country must match allowed values.
          To <em>create</em> new users (not just update), use the create form on{" "}
          <a href="/admin/users" className="underline">User Management</a>.
        </p>
      </div>

      {visibleSections.map((s) => {
        const sectionFields = fieldsBySection.get(s.id) ?? [];
        return (
          <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">{s.name}</p>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => selectAllInSection(s.id)}
                  className="text-blue-600 hover:underline"
                >
                  Select all
                </button>
                <span className="text-gray-300">·</span>
                <button
                  type="button"
                  onClick={() => clearAllInSection(s.id)}
                  className="text-blue-600 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {sectionFields.map((f) => (
                <div
                  key={f.id}
                  className="flex flex-col gap-1 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50"
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(f.id)}
                      onChange={() => toggle(f.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="truncate text-gray-700">{f.label}</span>
                    {f.built_in_key && (
                      <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-gray-500">
                        Built-in
                      </span>
                    )}
                  </label>
                  {f.field_type === "multi_row" &&
                    (f.subfields?.length ?? 0) > 0 &&
                    !selected.has(f.id) && (
                      <p className="pl-6 text-[11px] text-gray-400">
                        Sub-fields: {f.subfields.map((s) => s.label).join(", ")}
                      </p>
                    )}
                  {f.field_type === "multi_row" &&
                    selected.has(f.id) &&
                    (f.subfields?.length ?? 0) > 0 && (
                      <div className="flex flex-col gap-1 pl-6 pt-1">
                        <p className="text-[11px] font-medium text-gray-500">
                          Include sub-fields:
                        </p>
                        {f.subfields.map((sf) => {
                          const checked =
                            selectedSubfields[f.id]?.has(sf.key) ?? false;
                          return (
                            <label
                              key={sf.key}
                              className="flex cursor-pointer items-center gap-2 text-[11px] text-gray-600"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSubfield(f.id, sf.key)}
                                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span>{sf.label}</span>
                            </label>
                          );
                        })}
                        {(selectedSubfields[f.id]?.size ?? 0) === 0 && (
                          <p className="text-[10px] italic text-amber-600">
                            Pick at least one sub-field, or untick the field.
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400">
                          Each CSV row appends a new {f.label} entry per
                          employee — existing entries are not modified.
                        </p>
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <button
          type="button"
          onClick={downloadTemplate}
          disabled={orderedSelectedFields.length === 0}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download size={14} /> Download template ({orderedSelectedFields.length})
        </button>
        <label
          className={`flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 ${
            importing || orderedSelectedFields.length === 0
              ? "cursor-not-allowed opacity-50"
              : ""
          }`}
        >
          <Upload size={14} />
          {importing ? "Importing..." : "Upload CSV"}
          <input
            type="file"
            accept=".csv"
            onChange={handleUpload}
            disabled={importing || orderedSelectedFields.length === 0}
            className="hidden"
          />
        </label>
        {orderedSelectedFields.length === 0 && (
          <span className="text-xs text-gray-500">
            Pick at least one field to enable download and upload.
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            result.pending
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-green-200 bg-green-50 text-green-900"
          }`}
        >
          <p className="flex items-center gap-2 font-medium">
            {result.pending ? <Clock size={14} /> : <CheckCircle2 size={14} />}
            {result.pending ? "Submitted for approval" : "Import complete"}
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            <li>
              {result.pending ? (
                <>
                  <strong>{result.rowsUpdated}</strong> employee
                  {result.rowsUpdated === 1 ? "" : "s"} queued
                  {" "}({result.cellsWritten} cell{result.cellsWritten === 1 ? "" : "s"} pending) — an admin will review and apply.
                </>
              ) : (
                <>
                  <strong>{result.rowsUpdated}</strong> employee
                  {result.rowsUpdated === 1 ? "" : "s"} updated
                  {" "}({result.cellsWritten} cell{result.cellsWritten === 1 ? "" : "s"} written)
                </>
              )}
            </li>
            <li>{result.rowsProcessed - result.rowsUpdated} rows had no changes</li>
            {result.unknownEmails.length > 0 && (
              <li className="text-amber-800">
                Unknown emails (skipped): {result.unknownEmails.join(", ")}
              </li>
            )}
            {result.unknownColumns.length > 0 && (
              <li className="text-amber-800">
                Unknown columns (ignored): {result.unknownColumns.join(", ")}
              </li>
            )}
            {result.autoPopulatedColumns.length > 0 && (
              <li className="text-amber-800">
                Auto-populated columns (ignored — set in User Management or via scheduling):{" "}
                {result.autoPopulatedColumns.join(", ")}
              </li>
            )}
            {result.errors.length > 0 && (
              <li className="text-red-800">
                Errors:
                <ul className="mt-1 list-disc pl-5">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {result.errors.length > 5 && (
                    <li>...and {result.errors.length - 5} more</li>
                  )}
                </ul>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
