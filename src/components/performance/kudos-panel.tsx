"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Lock, Plus, Trash2, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { displayName } from "@/lib/utils";
import type { KudosWithUsers, KudosVisibility } from "@/types/database";

export function KudosPanel({
  employeeId,
  employeeLabel,
  initialKudos,
  canGive,
  currentUserId,
  canModerate,
}: {
  employeeId: string;
  employeeLabel: string;
  initialKudos: KudosWithUsers[];
  canGive: boolean;
  currentUserId: string;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] = useState<KudosVisibility>("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/kudos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient_id: employeeId,
        message: message.trim(),
        visibility,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    setMessage("");
    setVisibility("public");
    setOpen(false);
    router.refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this kudos?")) return;
    setBusy(true);
    const res = await fetch(`/api/kudos?id=${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wide text-gray-500">
          <Heart size={14} />
          Kudos
        </h2>
        {canGive && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus size={12} /> Give kudos
          </button>
        )}
      </div>

      {open && (
        <div className="mb-3 space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Recognize ${employeeLabel} for something great…`}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-700">
              <input
                type="radio"
                checked={visibility === "public"}
                onChange={() => setVisibility("public")}
              />
              Public
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700">
              <input
                type="radio"
                checked={visibility === "private"}
                onChange={() => setVisibility("private")}
              />
              Private (only {employeeLabel} sees)
            </label>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={busy || !message.trim()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "Sending..." : "Send"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setMessage("");
                  setError(null);
                }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {initialKudos.length === 0 ? (
        <p className="text-sm text-gray-500">No kudos yet.</p>
      ) : (
        <ul className="space-y-3">
          {initialKudos.map((k) => {
            const canDelete = k.sender_id === currentUserId || canModerate;
            return (
              <li
                key={k.id}
                className="rounded-lg border border-gray-100 bg-gray-50 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-gray-800">{k.message}</p>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => remove(k.id)}
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500">
                  {k.visibility === "private" && <Lock size={10} />}
                  <span>
                    from{" "}
                    <strong className="text-gray-700">
                      {displayName(k.sender ?? null)}
                    </strong>
                    {" · "}
                    {format(parseISO(k.created_at), "MMM d, yyyy")}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
