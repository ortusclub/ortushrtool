"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { hasNightDifferentialHours, nightDifferentialHours } from "@/lib/utils";
import { NightDiffBanner } from "@/components/shared/night-diff-banner";

export default function OvertimeRequestPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [eligibilityChecked, setEligibilityChecked] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [error, setError] = useState("");

  const [requestedDate, setRequestedDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data } = await supabase
        .from("users")
        .select("overtime_eligible")
        .eq("id", user.id)
        .single();
      setEligible(!!data?.overtime_eligible);
      setEligibilityChecked(true);
    })();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!requestedDate || !startTime || !endTime) {
      setError("Date, start time, and end time are required.");
      setLoading(false);
      return;
    }
    if (startTime && endTime && startTime === endTime) {
      setError("Start time and end time cannot be the same.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("overtime_requests")
      .insert({
        employee_id: user.id,
        requested_date: requestedDate,
        start_time: startTime,
        end_time: endTime,
        reason,
      });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    try {
      await fetch("/api/notifications/overtime-submitted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_date: requestedDate,
          start_time: startTime,
          end_time: endTime,
          reason,
        }),
      });
    } catch {
      // Non-blocking
    }

    router.push("/requests");
    router.refresh();
  };

  if (!eligibilityChecked) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!eligible) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link
          href="/requests"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back to Requests
        </Link>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-lg font-semibold text-amber-900">
            Overtime requests not enabled for your account
          </h1>
          <p className="mt-2 text-sm text-amber-800">
            Your role isn&apos;t flagged as eligible for overtime. If you think
            this is wrong, please reach out to HR.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/requests"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back to Requests
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Request Overtime</h1>
        <p className="text-gray-600">
          Request approval for working extra hours on a specific date.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-gray-200 bg-white p-6"
      >
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Date
          </label>
          <input
            type="date"
            required
            value={requestedDate}
            onChange={(e) => setRequestedDate(e.target.value)}

            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Enter only your <span className="font-semibold">OT hours</span> — do not include your regular shift. For overnight OT, the end time may be earlier than the start time (e.g. 23:00 – 02:00).
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              OT start time
            </label>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              OT end time{startTime && endTime && endTime < startTime && (
                <span className="ml-2 text-xs font-normal text-amber-600">(next day)</span>
              )}
            </label>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {hasNightDifferentialHours(startTime, endTime) && (
          <NightDiffBanner
            message={`Heads up: this OT overlaps night hours (22:00–06:00), so night differential applies — about ${nightDifferentialHours(startTime, endTime)}h of this request qualifies.`}
          />
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Why do you need to work overtime?
          </label>
          <textarea
            required
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Briefly explain the reason for the overtime..."
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-orange-600 px-6 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit Request"}
          </button>
          <Link
            href="/requests"
            className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
