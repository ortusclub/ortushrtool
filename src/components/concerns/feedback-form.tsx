"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
} from "@/types/database";

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";

export function FeedbackForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    category: "general" as FeedbackCategory,
    subject: "",
    body: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.body.trim()) {
      setError("Please share your feedback.");
      return;
    }
    setSubmitting(true);
    setError("");

    const supabase = createClient();
    // No reporter_id, no metadata. Just the message.
    const { error: insertError } = await supabase
      .from("anonymous_feedback")
      .insert({
        category: form.category,
        subject: form.subject.trim() || null,
        body: form.body.trim(),
      });

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-6 text-center">
        <CheckCircle2 size={32} className="mx-auto text-teal-600" />
        <h2 className="mt-3 text-lg font-semibold text-gray-900">
          Feedback sent
        </h2>
        <p className="mt-2 text-sm text-gray-700">
          Thank you. HR will see your message without any link to you.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setForm({ category: "general", subject: "", body: "" });
              setSubmitted(false);
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white"
          >
            Send another
          </button>
          <button
            type="button"
            onClick={() => router.push("/concerns")}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-xl border border-gray-200 bg-white p-6"
    >
      <div className="flex items-start gap-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
        <Lock size={16} className="mt-0.5 shrink-0" />
        <p>
          Your identity isn&apos;t stored with this submission. Don&apos;t
          include personal details (your name, email, phone) in the message if
          you want it to stay anonymous.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Category
        </label>
        <select
          required
          value={form.category}
          onChange={(e) =>
            setForm({ ...form, category: e.target.value as FeedbackCategory })
          }
          className={inputClass}
        >
          {Object.entries(FEEDBACK_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Subject (optional)
        </label>
        <input
          type="text"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder="One-line summary"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          rows={8}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="Share your thoughts, concerns, or suggestions…"
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        {submitting ? "Sending…" : "Send Feedback"}
      </button>
    </form>
  );
}
