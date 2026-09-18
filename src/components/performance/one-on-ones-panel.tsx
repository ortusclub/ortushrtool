"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pencil, Plus, Save, Trash2, X, Users as UsersIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { OneOnOne } from "@/types/database";
import { PeoplePicker, type PickerUser } from "@/components/performance/people-picker";
import { displayName } from "@/lib/utils";

type ViewerRole = "manager" | "employee" | "skip_level" | "hr_admin";

export function OneOnOnesPanel({
  employeeId,
  oneOnOnes,
  canCreate,
  canDelete,
  viewerId,
  viewerRole,
  participantCandidates,
  userIndex,
}: {
  employeeId: string;
  oneOnOnes: OneOnOne[];
  canCreate: boolean;
  canDelete: boolean;
  viewerId: string;
  viewerRole: ViewerRole;
  /** People that can be selected as additional participants. */
  participantCandidates: PickerUser[];
  /** Lookup for displaying participant names on existing rows. */
  userIndex: Record<string, PickerUser>;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wide text-gray-500">
          <CalendarClock size={14} />
          1-on-1s
        </h2>
        {canCreate && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus size={12} /> Schedule 1-on-1
          </button>
        )}
      </div>

      {creating && (
        <OneOnOneForm
          mode="create"
          employeeId={employeeId}
          viewerRole={viewerRole}
          participantCandidates={participantCandidates}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}

      {oneOnOnes.length === 0 && !creating ? (
        <p className="text-sm text-gray-500">No 1-on-1s on record.</p>
      ) : (
        <ul className="space-y-3">
          {oneOnOnes.map((o) =>
            editingId === o.id ? (
              <OneOnOneForm
                key={o.id}
                mode="edit"
                row={o}
                viewerRole={viewerRole}
                participantCandidates={participantCandidates}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  router.refresh();
                }}
              />
            ) : (
              <OneOnOneCard
                key={o.id}
                row={o}
                viewerId={viewerId}
                viewerRole={viewerRole}
                userIndex={userIndex}
                canEdit
                canDelete={canDelete && (viewerRole === "manager" || viewerRole === "hr_admin")}
                onEdit={() => setEditingId(o.id)}
                onDeleted={() => router.refresh()}
              />
            )
          )}
        </ul>
      )}
    </div>
  );
}

function OneOnOneCard({
  row,
  viewerId,
  viewerRole,
  userIndex,
  canEdit,
  canDelete,
  onEdit,
  onDeleted,
}: {
  row: OneOnOne;
  viewerId: string;
  viewerRole: ViewerRole;
  userIndex: Record<string, PickerUser>;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const showManagerPrivate =
    viewerRole === "manager" || viewerRole === "hr_admin";
  const showEmployeePrivate =
    viewerRole === "employee" || viewerRole === "hr_admin";
  void viewerId;
  const attendees = Array.from(
    new Set(
      [row.manager_id, ...(row.participants ?? [])].filter(
        (id): id is string => !!id
      )
    )
  );
  const remove = async () => {
    if (!confirm("Delete this 1-on-1?")) return;
    const res = await fetch(`/api/one-on-ones/${row.id}`, { method: "DELETE" });
    if (res.ok) onDeleted();
  };
  return (
    <li className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {format(parseISO(row.scheduled_date), "MMM d, yyyy")}
          </p>
          {attendees.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-600">
              <UsersIcon size={12} className="text-gray-400" />
              {attendees
                .map((id) => {
                  const u = userIndex[id];
                  return u ? displayName(u) : "Unknown";
                })
                .join(", ")}
            </p>
          )}
          {row.agenda && (
            <p className="mt-1 text-xs">
              <span className="font-medium text-gray-500">Agenda:</span>{" "}
              <span className="text-gray-700">{row.agenda}</span>
            </p>
          )}
          {row.shared_notes && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">
              {row.shared_notes}
            </p>
          )}
          {showManagerPrivate && row.manager_private_notes && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              <p className="font-medium">Manager-only notes</p>
              <p className="mt-0.5 whitespace-pre-wrap">
                {row.manager_private_notes}
              </p>
            </div>
          )}
          {showEmployeePrivate && row.employee_private_notes && (
            <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
              <p className="font-medium">Your private notes</p>
              <p className="mt-0.5 whitespace-pre-wrap">
                {row.employee_private_notes}
              </p>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded p-1 text-gray-500 hover:bg-gray-200"
              title="Edit"
            >
              <Pencil size={12} />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={remove}
              className="rounded p-1 text-red-500 hover:bg-red-50"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function OneOnOneForm({
  mode,
  row,
  employeeId,
  viewerRole,
  participantCandidates,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  row?: OneOnOne;
  employeeId?: string;
  viewerRole: ViewerRole;
  participantCandidates: PickerUser[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [scheduledDate, setScheduledDate] = useState(
    row?.scheduled_date ?? new Date().toISOString().slice(0, 10)
  );
  const [agenda, setAgenda] = useState(row?.agenda ?? "");
  const [sharedNotes, setSharedNotes] = useState(row?.shared_notes ?? "");
  const [managerPrivate, setManagerPrivate] = useState(
    row?.manager_private_notes ?? ""
  );
  const [employeePrivate, setEmployeePrivate] = useState(
    row?.employee_private_notes ?? ""
  );
  // Combined attendee list — defaults to the existing manager + participants.
  const [attendees, setAttendees] = useState<string[]>(() => {
    const existing = [
      row?.manager_id,
      ...(row?.participants ?? []),
    ].filter((x): x is string => !!x);
    return Array.from(new Set(existing));
  });
  const subjectId = employeeId ?? row?.employee_id ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEditManagerPrivate =
    viewerRole === "manager" || viewerRole === "hr_admin";
  const canEditEmployeePrivate =
    viewerRole === "employee" || viewerRole === "hr_admin";

  const submit = async () => {
    setBusy(true);
    setError(null);
    const body = {
      employee_id: employeeId ?? row?.employee_id,
      scheduled_date: scheduledDate,
      agenda: agenda || null,
      shared_notes: sharedNotes || null,
      manager_private_notes: canEditManagerPrivate
        ? managerPrivate || null
        : undefined,
      employee_private_notes: canEditEmployeePrivate
        ? employeePrivate || null
        : undefined,
      participants: attendees,
    };
    const url = mode === "create" ? "/api/one-on-ones" : `/api/one-on-ones/${row!.id}`;
    const method = mode === "create" ? "POST" : "PATCH";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Save failed");
      return;
    }
    onSaved();
  };

  return (
    <li className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
      {error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Attendees
        </label>
        <PeoplePicker
          candidates={participantCandidates}
          selectedIds={attendees}
          onChange={setAttendees}
          excludeIds={subjectId ? [subjectId] : []}
          placeholder="Search by name or email…"
        />
        <p className="mt-1 text-[11px] text-gray-400">
          The subject of the meeting is added automatically; pick everyone else
          who attended (manager, HR, peers…).
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Agenda
          </label>
          <input
            type="text"
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Shared notes
          </label>
          <textarea
            rows={3}
            value={sharedNotes}
            onChange={(e) => setSharedNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        {canEditManagerPrivate && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-amber-700">
              Manager-only notes
            </label>
            <textarea
              rows={2}
              value={managerPrivate}
              onChange={(e) => setManagerPrivate(e.target.value)}
              className="w-full rounded-lg border border-amber-200 px-3 py-1.5 text-sm"
            />
          </div>
        )}
        {canEditEmployeePrivate && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-blue-700">
              Your private notes
            </label>
            <textarea
              rows={2}
              value={employeePrivate}
              onChange={(e) => setEmployeePrivate(e.target.value)}
              className="w-full rounded-lg border border-blue-200 px-3 py-1.5 text-sm"
            />
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={12} /> {busy ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <X size={12} />
        </button>
      </div>
    </li>
  );
}
