"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Pencil, Save, X } from "lucide-react";
import type { User, UserRole } from "@/types/database";

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

  const roleOptions: UserRole[] =
    currentUserRole === "super_admin"
      ? ["employee", "manager", "hr_admin", "super_admin"]
      : ["employee", "manager"];

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search by name, email, or department..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

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
                      {isEditing ? (
                        <div className="flex gap-1">
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
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(user)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
