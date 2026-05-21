"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PeoplePicker, type PickerUser } from "@/components/performance/people-picker";
import { INCIDENT_TYPE_LABELS, type IncidentType } from "@/types/database";

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

interface Props {
  currentUserId: string;
  candidates: PickerUser[];
}

export function IncidentForm({ currentUserId, candidates }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    incident_date: today,
    incident_type: "other" as IncidentType,
    location: "",
    people_involved_user_ids: [] as string[],
    people_involved_other: "",
    summary: "",
    outcome: "",
  });
  const [files, setFiles] = useState<File[]>([]);

  const addFiles = (selected: FileList | null) => {
    if (!selected) return;
    setFiles((prev) => [...prev, ...Array.from(selected)]);
  };
  const removeFile = (index: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.summary.trim()) {
      setError("Please describe what happened.");
      return;
    }
    setSubmitting(true);
    setError("");

    const supabase = createClient();

    const { data: inserted, error: insertError } = await supabase
      .from("incident_reports")
      .insert({
        reporter_id: currentUserId,
        incident_date: form.incident_date,
        incident_type: form.incident_type,
        location: form.location.trim() || null,
        people_involved_user_ids: form.people_involved_user_ids,
        people_involved_other: form.people_involved_other.trim() || null,
        summary: form.summary.trim(),
        outcome: form.outcome.trim() || null,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      setError(insertError?.message ?? "Failed to submit report.");
      setSubmitting(false);
      return;
    }

    // Upload attachments to concern-attachments/{report_id}/{filename}.
    // Failures are surfaced but don't roll back the report — the report is
    // still useful without the attachment, and HR can request a re-upload.
    const uploadFailures: string[] = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${inserted.id}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("concern-attachments")
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        uploadFailures.push(`${file.name}: ${uploadError.message}`);
        continue;
      }
      const { error: metaError } = await supabase
        .from("incident_report_attachments")
        .insert({
          report_id: inserted.id,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: currentUserId,
        });
      if (metaError) uploadFailures.push(`${file.name}: ${metaError.message}`);
    }

    if (uploadFailures.length > 0) {
      setError(`Report saved, but some files failed:\n${uploadFailures.join("\n")}`);
      setSubmitting(false);
      return;
    }

    router.push(`/concerns/${inserted.id}`);
    router.refresh();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-xl border border-gray-200 bg-white p-6"
    >
      {error && (
        <div className="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Date of incident
          </label>
          <input
            type="date"
            required
            max={today}
            value={form.incident_date}
            onChange={(e) => setForm({ ...form, incident_date: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Type</label>
          <select
            required
            value={form.incident_type}
            onChange={(e) =>
              setForm({ ...form, incident_type: e.target.value as IncidentType })
            }
            className={inputClass}
          >
            {Object.entries(INCIDENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Where did it happen?
        </label>
        <input
          type="text"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          placeholder="Office, online meeting, off-site, …"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          People involved
        </label>
        <p className="text-xs text-gray-500">
          Search the directory and pick who was involved. We&apos;ll show you
          their full name to make sure you&apos;ve picked the right person.
        </p>
        <div className="mt-2">
          <PeoplePicker
            candidates={candidates}
            selectedIds={form.people_involved_user_ids}
            onChange={(ids) =>
              setForm({ ...form, people_involved_user_ids: ids })
            }
            placeholder="Search by name or email…"
            excludeIds={[currentUserId]}
          />
        </div>
        <input
          type="text"
          value={form.people_involved_other}
          onChange={(e) =>
            setForm({ ...form, people_involved_other: e.target.value })
          }
          placeholder="Anyone else not in the directory? (optional)"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Summary of what happened <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          rows={5}
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
          placeholder="Describe what occurred, in your own words."
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Effect or outcome
        </label>
        <textarea
          rows={3}
          value={form.outcome}
          onChange={(e) => setForm({ ...form, outcome: e.target.value })}
          placeholder="Impact on you or others — emotional, physical, work-related, etc."
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Attachments
        </label>
        <p className="text-xs text-gray-500">
          Screenshots, documents, photos — anything that helps HR understand
          the situation.
        </p>
        <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          <Paperclip size={14} />
          Add files
          <input
            type="file"
            multiple
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
        </label>
        {files.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-gray-800">{f.name}</p>
                  <p className="text-xs text-gray-500">
                    {(f.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                  aria-label="Remove file"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {submitting ? "Submitting…" : "Submit Report"}
        </button>
      </div>
    </form>
  );
}
