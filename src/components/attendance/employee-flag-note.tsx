"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function EmployeeFlagNote({
  flagId,
  initialNote,
  acknowledged,
}: {
  flagId: string;
  initialNote: string | null;
  acknowledged: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("attendance_flags")
      .update({ employee_notes: note.trim() || null })
      .eq("id", flagId);
    setEditing(false);
    setSaving(false);
    router.refresh();
  };

  // Once acknowledged, employees can no longer edit their note.
  if (acknowledged) {
    if (!initialNote) return null;
    return (
      <p className="text-sm text-gray-600">
        <span className="font-medium text-gray-700">Your note:</span>{" "}
        <span className="italic">{initialNote}</span>
      </p>
    );
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add an explanation for your manager..."
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : initialNote ? "Update" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setNote(initialNote ?? "");
              setEditing(false);
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {initialNote ? (
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-700">Your note:</span>{" "}
          <span className="italic">{initialNote}</span>
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-medium text-blue-600 hover:underline"
      >
        {initialNote ? "Edit my note" : "Add a note"}
      </button>
    </div>
  );
}
