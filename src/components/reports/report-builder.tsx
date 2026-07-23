"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Download, Save, Trash2, FolderOpen } from "lucide-react";
import {
  SOURCES,
  getSource,
  type FilterValue,
  type FilterValues,
} from "@/lib/reports/sources";

type Template = {
  id: string;
  name: string;
  source: string;
  columns: string[];
  filters: FilterValues;
  created_at: string;
  created_by_name?: string;
};

const inputClass =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function ReportBuilder({
  initialTemplates,
  departments,
}: {
  initialTemplates: Template[];
  departments: string[];
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [sourceId, setSourceId] = useState<string>(SOURCES[0].id);
  const [columns, setColumns] = useState<Set<string>>(
    new Set(SOURCES[0].defaultColumns)
  );
  const [filters, setFilters] = useState<FilterValues>({});
  const [templateName, setTemplateName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const source = getSource(sourceId)!;

  // Reset columns + filters when switching source
  useEffect(() => {
    const s = getSource(sourceId);
    if (!s) return;
    setColumns(new Set(s.defaultColumns));
    setFilters({});
  }, [sourceId]);

  const toggleColumn = (id: string) => {
    setColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setFilter = (id: string, value: FilterValue) => {
    setFilters((prev) => ({ ...prev, [id]: value }));
  };

  const orderedColumns = useMemo(
    () => source.columns.map((c) => c.id).filter((id) => columns.has(id)),
    [source, columns]
  );

  const handleDownload = async () => {
    if (orderedColumns.length === 0) {
      setMessage("Pick at least one column.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/reports/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: sourceId,
        columns: orderedColumns,
        filters,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Export failed");
      setBusy(false);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `${sourceId}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setBusy(false);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      setMessage("Give the template a name first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("report_templates")
      .insert({
        name: templateName.trim(),
        source: sourceId,
        columns: orderedColumns,
        filters,
        created_by: user?.id,
      })
      .select("*")
      .single();
    if (error || !data) {
      setMessage(error?.message || "Save failed");
      setBusy(false);
      return;
    }
    setTemplates((prev) => [data as Template, ...prev]);
    setTemplateName("");
    setMessage(`Saved template "${data.name}".`);
    setBusy(false);
    router.refresh();
  };

  const loadTemplate = (t: Template) => {
    setSourceId(t.source);
    // The useEffect above resets columns/filters when sourceId changes — so
    // we need to apply the saved selections AFTER that resets fire. Use a
    // microtask via setTimeout(0) so React commits the source change first.
    setTimeout(() => {
      setColumns(new Set(t.columns));
      setFilters(t.filters);
      setMessage(`Loaded template "${t.name}".`);
    }, 0);
  };

  const deleteTemplate = async (t: Template) => {
    if (!confirm(`Delete the template "${t.name}"? Other HR users will lose it too.`)) {
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("report_templates")
      .delete()
      .eq("id", t.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    router.refresh();
  };

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
        Custom Report Builder
      </h2>

      {/* Source */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="block text-xs font-medium text-gray-500">
          Data source
        </label>
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className={`mt-1 ${inputClass}`}
        >
          {SOURCES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">{source.description}</p>
      </div>

      {/* Filters */}
      {source.filters.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Filters
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {source.filters.map((f) => {
              if (f.type === "select") {
                // The Department filter's options are dynamic — fill them from
                // the live department list rather than the placeholder in the
                // source registry. "any" stays the default no-op option.
                const options =
                  f.id === "department"
                    ? [
                        { value: "any", label: "Any department" },
                        ...departments.map((d) => ({ value: d, label: d })),
                      ]
                    : f.options;
                const value = (filters[f.id] as string) ?? options[0].value;
                return (
                  <div key={f.id}>
                    <label className="block text-[11px] font-medium text-gray-500">
                      {f.label}
                    </label>
                    <select
                      value={value}
                      onChange={(e) => setFilter(f.id, e.target.value)}
                      className={`mt-1 ${inputClass}`}
                    >
                      {options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }
              const range = (filters[f.id] as { from?: string; to?: string }) ?? {};
              return (
                <div key={f.id} className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-gray-500">
                    {f.label}
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="date"
                      value={range.from ?? ""}
                      onChange={(e) =>
                        setFilter(f.id, { ...range, from: e.target.value })
                      }
                      className={inputClass}
                    />
                    <span className="self-center text-xs text-gray-400">→</span>
                    <input
                      type="date"
                      value={range.to ?? ""}
                      onChange={(e) =>
                        setFilter(f.id, { ...range, to: e.target.value })
                      }
                      min={range.from || undefined}
                      className={inputClass}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Columns */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Columns ({columns.size} selected)
          </p>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setColumns(new Set(source.columns.map((c) => c.id)))}
              className="text-blue-600 hover:underline"
            >
              Select all
            </button>
            <span className="text-gray-300">·</span>
            <button
              type="button"
              onClick={() => setColumns(new Set(source.defaultColumns))}
              className="text-blue-600 hover:underline"
            >
              Defaults
            </button>
            <span className="text-gray-300">·</span>
            <button
              type="button"
              onClick={() => setColumns(new Set())}
              className="text-blue-600 hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {source.columns.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={columns.has(c.id)}
                onChange={() => toggleColumn(c.id)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="truncate text-gray-700">{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy || columns.size === 0}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Download size={14} />
          {busy ? "Preparing..." : "Download CSV"}
        </button>
        <div className="flex flex-1 items-end gap-2">
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-gray-500">
              Template name
            </label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Monthly approved leaves"
              className={`mt-1 w-full ${inputClass}`}
            />
          </div>
          <button
            type="button"
            onClick={saveTemplate}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Save size={14} /> Save as template
          </button>
        </div>
      </div>

      {message && (
        <p
          className={`text-sm ${
            message.startsWith("Save failed") || message.startsWith("Export failed") || message.startsWith("Pick")
              ? "text-red-600"
              : "text-gray-600"
          }`}
        >
          {message}
        </p>
      )}

      {/* Saved Templates */}
      {templates.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Saved Templates (shared across HR)
          </p>
          <div className="space-y-2">
            {templates.map((t) => {
              const src = getSource(t.source);
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-500">
                      {src?.label ?? t.source} · {t.columns.length} column{t.columns.length === 1 ? "" : "s"}
                      {t.created_by_name ? ` · by ${t.created_by_name}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadTemplate(t)}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <FolderOpen size={12} /> Load
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(t)}
                    className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
