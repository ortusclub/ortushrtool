"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Save, X, Calendar, Trash2, Plus } from "lucide-react";
import type { User, UserRole, HolidayCountry } from "@/types/database";
import { HOLIDAY_COUNTRY_LABELS } from "@/types/database";

const COUNTRY_OPTIONS: HolidayCountry[] = ["PH", "XK", "IT", "AE"];

export function UserManagement({
  users,
  currentUserRole,
}: {
  users: User[];
  currentUserRole: UserRole;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.department ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (user: User) => {
    setEditingId(user.id);
    setEditForm({
      full_name: user.full_name,
      role: user.role,
      department: user.department,
      manager_id: user.manager_id,
      desktime_employee_id: user.desktime_employee_id,
      holiday_country: user.holiday_country,
      is_active: user.is_active,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const supabase = createClient();

    await supabase
      .from("users")
      .update(editForm)
      .eq("id", editingId);

    setEditingId(null);
    router.refresh();
  };

  const [deleting, setDeleting] = useState<string | null>(null);

  const deleteUser = async (user: User) => {
    if (!confirm(`Permanently delete ${user.full_name || user.email}? This will remove all their data (schedules, attendance, flags, etc.) and cannot be undone.`)) {
      return;
    }
    setDeleting(user.id);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to delete user");
      } else {
        router.refresh();
      }
    } catch {
      alert("Failed to delete user");
    } finally {
      setDeleting(null);
    }
  };

  const roleOptions: UserRole[] =
    currentUserRole === "super_admin"
      ? ["employee", "manager", "hr_admin", "super_admin"]
      : ["employee", "manager"];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, email, or department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95"
        >
          <Plus size={16} />
          Add User
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="px-4 py-3 font-medium text-gray-600">Department</th>
                <th className="px-4 py-3 font-medium text-gray-600">Manager</th>
                <th className="px-4 py-3 font-medium text-gray-600">Country</th>
                <th className="px-4 py-3 font-medium text-gray-600">DeskTime ID</th>
                <th className="px-4 py-3 font-medium text-gray-600">Active</th>
                <th className="px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((user) => {
                const isEditing = editingId === user.id;
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          value={editForm.full_name ?? ""}
                          onChange={(e) =>
                            setEditForm({ ...editForm, full_name: e.target.value })
                          }
                          className="w-full rounded border px-2 py-1 text-sm"
                        />
                      ) : (
                        user.full_name || "-"
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editForm.role}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              role: e.target.value as UserRole,
                            })
                          }
                          className="rounded border px-2 py-1 text-sm"
                        >
                          {roleOptions.map((r) => (
                            <option key={r} value={r}>
                              {r.replace("_", " ")}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="capitalize">
                          {user.role.replace("_", " ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          value={editForm.department ?? ""}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              department: e.target.value || null,
                            })
                          }
                          className="w-full rounded border px-2 py-1 text-sm"
                        />
                      ) : (
                        user.department || "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editForm.manager_id ?? ""}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              manager_id: e.target.value || null,
                            })
                          }
                          className="rounded border px-2 py-1 text-sm"
                        >
                          <option value="">None</option>
                          {users
                            .filter((u) => u.id !== user.id)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.full_name || u.email}
                              </option>
                            ))}
                        </select>
                      ) : (
                        users.find((u) => u.id === user.manager_id)?.full_name ??
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editForm.holiday_country ?? "PH"}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              holiday_country: e.target.value as HolidayCountry,
                            })
                          }
                          className="rounded border px-2 py-1 text-sm"
                        >
                          {COUNTRY_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {HOLIDAY_COUNTRY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {HOLIDAY_COUNTRY_LABELS[user.holiday_country] ?? user.holiday_country}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editForm.desktime_employee_id ?? ""}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              desktime_employee_id: e.target.value
                                ? parseInt(e.target.value)
                                : null,
                            })
                          }
                          className="w-20 rounded border px-2 py-1 text-sm"
                        />
                      ) : (
                        user.desktime_employee_id ?? "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={editForm.is_active ?? true}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              is_active: e.target.checked,
                            })
                          }
                        />
                      ) : user.is_active ? (
                        <span className="text-green-600">Yes</span>
                      ) : (
                        <span className="text-red-600">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={saveEdit}
                              className="rounded p-1 text-green-600 hover:bg-green-50"
                            >
                              <Save size={16} />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100"
                            >
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(user)}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              title="Edit user"
                            >
                              <Pencil size={16} />
                            </button>
                            <Link
                              href={`/admin/schedules/${user.id}`}
                              className="rounded p-1 text-blue-500 hover:bg-blue-50 hover:text-blue-700"
                              title="Edit schedule"
                            >
                              <Calendar size={16} />
                            </Link>
                            <button
                              onClick={() => deleteUser(user)}
                              disabled={deleting === user.id}
                              className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              title="Delete user"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <AddUserModal
          users={users}
          roleOptions={roleOptions}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

interface DaySchedule {
  work_location: "office" | "online";
  start_time: string;
  end_time: string;
  is_rest_day: boolean;
}

const DEFAULT_DAY: DaySchedule = { work_location: "office", start_time: "09:00", end_time: "18:00", is_rest_day: false };

function AddUserModal({
  users,
  roleOptions,
  onClose,
  onSuccess,
}: {
  users: User[];
  roleOptions: UserRole[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    role: "employee" as UserRole,
    department: "",
    manager_id: "",
    desktime_employee_id: "",
    holiday_country: "PH" as HolidayCountry,
  });
  const [includeSchedule, setIncludeSchedule] = useState(false);
  const [days, setDays] = useState<DaySchedule[]>(
    WEEKDAYS.map(() => ({ ...DEFAULT_DAY }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateDay = (idx: number, updates: Partial<DaySchedule>) => {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, ...updates } : d)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const schedule = includeSchedule
        ? [
            ...days.map((d, i) => ({
              day_of_week: i,
              start_time: d.is_rest_day ? "00:00" : d.start_time,
              end_time: d.is_rest_day ? "00:00" : d.end_time,
              is_rest_day: d.is_rest_day,
              work_location: d.work_location,
            })),
            { day_of_week: 5, start_time: "00:00", end_time: "00:00", is_rest_day: true, work_location: "office" },
            { day_of_week: 6, start_time: "00:00", end_time: "00:00", is_rest_day: true, work_location: "office" },
          ]
        : null;

      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          manager_id: form.manager_id || null,
          desktime_employee_id: form.desktime_employee_id || null,
          department: form.department || null,
          schedule,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create user");
        return;
      }

      onSuccess();
    } catch {
      setError("Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Add New User</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* User details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className={inputClass}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>{r.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
              <input type="text" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Manager</label>
              <select value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} className={inputClass}>
                <option value="">None</option>
                {users
                  .filter((u) => u.role === "manager" || u.role === "hr_admin" || u.role === "super_admin")
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Country</label>
              <select value={form.holiday_country} onChange={(e) => setForm({ ...form, holiday_country: e.target.value as HolidayCountry })} className={inputClass}>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{HOLIDAY_COUNTRY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">DeskTime ID</label>
              <input type="number" value={form.desktime_employee_id} onChange={(e) => setForm({ ...form, desktime_employee_id: e.target.value })} className={inputClass} />
            </div>
          </div>

          {/* Schedule toggle */}
          <div className="border-t border-gray-200 pt-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={includeSchedule}
                onChange={(e) => setIncludeSchedule(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Set weekly schedule</span>
            </label>
          </div>

          {includeSchedule && (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              {WEEKDAYS.map((dayName, i) => (
                <div key={dayName} className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium text-gray-700">{dayName}</span>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={days[i].is_rest_day}
                      onChange={(e) => updateDay(i, { is_rest_day: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    Rest
                  </label>
                  {!days[i].is_rest_day && (
                    <>
                      <select
                        value={days[i].work_location}
                        onChange={(e) => updateDay(i, { work_location: e.target.value as "office" | "online" })}
                        className="rounded border border-gray-300 px-2 py-1.5 text-xs"
                      >
                        <option value="office">Office</option>
                        <option value="online">Online</option>
                      </select>
                      <input
                        type="time"
                        value={days[i].start_time}
                        onChange={(e) => updateDay(i, { start_time: e.target.value })}
                        className="rounded border border-gray-300 px-2 py-1.5 text-xs"
                      />
                      <span className="text-xs text-gray-400">to</span>
                      <input
                        type="time"
                        value={days[i].end_time}
                        onChange={(e) => updateDay(i, { end_time: e.target.value })}
                        className="rounded border border-gray-300 px-2 py-1.5 text-xs"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
