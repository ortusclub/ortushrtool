"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PeoplePicker, type PickerUser } from "@/components/performance/people-picker";

export type FeedbackCandidate = PickerUser & { department: string | null };

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

interface Props {
  currentUserId: string;
  departments: string[];
  candidates: FeedbackCandidate[];
}

export function FeedbackForm({ currentUserId, departments, candidates }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [department, setDepartment] = useState("");
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  // Only people in the chosen department can be picked as the specific target.
  const peopleInDept = useMemo<PickerUser[]>(
    () =>
      department
        ? candidates.filter((c) => c.department === department)
        : [],
    [candidates, department]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!department) {
      setError("Please choose a department.");
      return;
    }
    if (!subject.trim() || !message.trim()) {
      setError("Please add a subject and your feedback.");
      return;
    }
    setSubmitting(true);
    setError("");

    const supabase = createClient();
    const { data: inserted, error: insertError } = await supabase
      .from("p2p_feedback")
      .insert({
        author_id: currentUserId,
        target_department: department,
        target_user_id: personIds[0] ?? null,
        subject: subject.trim(),
        message: message.trim(),
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      setError(insertError?.message ?? "Failed to submit feedback.");
      setSubmitting(false);
      return;
    }

    // Notify HR — non-blocking; the feedback is saved either way.
    fetch("/api/notifications/p2p-feedback-submitted", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback_id: inserted.id }),
    }).catch(() => {});

    setSubmitting(false);
    setDepartment("");
    setPersonIds([]);
    setSubject("");
    setMessage("");
    router.refresh();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
    >
      {error && (
        <div className="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
          Department <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500">Who is this feedback for?</p>
        <select
          required
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setPersonIds([]);
          }}
          className={inputClass}
        >
          <option value="">Select a department…</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {department && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
            Specific person (optional)
          </label>
          <p className="text-xs text-gray-500">
            Leave blank to address the whole {department} team.
          </p>
          <div className="mt-2">
            <PeoplePicker
              candidates={peopleInDept}
              selectedIds={personIds}
              onChange={setPersonIds}
              placeholder={`Search someone in ${department}…`}
              excludeIds={[currentUserId]}
              singleSelect
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
          Subject <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="A short summary"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
          Your feedback <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Share your feedback. HR will review it before forwarding it on."
          className={inputClass}
        />
      </div>

      <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500 dark:bg-gray-700/40 dark:text-gray-400">
        Your feedback is <strong>anonymous</strong> — the recipient never sees
        your name.
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Send size={14} />
        )}
        {submitting ? "Submitting…" : "Submit feedback"}
      </button>
    </form>
  );
}
