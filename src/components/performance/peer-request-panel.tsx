"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, X } from "lucide-react";
import { displayName } from "@/lib/utils";
import type { PeerFeedbackRequest } from "@/types/database";

type Peer = PeerFeedbackRequest & {
  reviewer?: {
    full_name: string;
    preferred_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
};

type Candidate = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
};

export function PeerRequestPanel({
  reviewId,
  requests,
  canRequest,
  candidates,
}: {
  reviewId: string;
  requests: Peer[];
  canRequest: boolean;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(() => {
    const taken = new Set(requests.map((r) => r.reviewer_id));
    return candidates.filter((c) => !taken.has(c.id));
  }, [requests, candidates]);

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/peer-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        review_id: reviewId,
        reviewer_id: picked,
        anonymous,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Request failed");
      return;
    }
    setPicked("");
    setAdding(false);
    router.refresh();
  };

  const statusStyles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    completed: "bg-emerald-100 text-emerald-800",
    declined: "bg-gray-200 text-gray-600",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wide text-gray-500">
          <Users size={14} /> Peer Feedback Requests
        </h2>
        {canRequest && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus size={12} /> Request feedback
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {adding && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">Pick a colleague…</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>
                {displayName(u)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            Anonymous
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !picked}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setPicked("");
            }}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {requests.length === 0 ? (
        <p className="text-sm text-gray-500">No peer feedback requested yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {requests.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {r.reviewer ? displayName(r.reviewer) : "Reviewer"}
                  {r.anonymous && (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                      anonymous
                    </span>
                  )}
                </p>
                {r.reviewer && (
                  <p className="text-xs text-gray-500">{r.reviewer.email}</p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyles[r.status]}`}
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
