import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/utils";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flagId } = await params;

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", authUser.id)
    .single();

  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: flag } = await admin
    .from("attendance_flags")
    .select("id, employee_id, acknowledged, employee:users!attendance_flags_employee_id_fkey(manager_id)")
    .eq("id", flagId)
    .single();

  if (!flag) {
    return NextResponse.json({ error: "Flag not found" }, { status: 404 });
  }

  if (flag.acknowledged) {
    return NextResponse.json({ error: "Flag already acknowledged" }, { status: 409 });
  }

  if (flag.employee_id === caller.id) {
    return NextResponse.json(
      { error: "You cannot acknowledge your own flag" },
      { status: 403 }
    );
  }

  const isAdmin = hasRole(caller.role, "hr_admin");
  const employee = Array.isArray(flag.employee) ? flag.employee[0] : flag.employee;
  const isDirectManager = employee?.manager_id === caller.id;

  if (!isAdmin && !isDirectManager) {
    return NextResponse.json(
      { error: "Only the employee's direct manager or HR can acknowledge" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  const { error } = await admin
    .from("attendance_flags")
    .update({ acknowledged: true, notes: notes || null })
    .eq("id", flagId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
