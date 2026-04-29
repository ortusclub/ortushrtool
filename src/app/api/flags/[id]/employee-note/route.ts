import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const admin = createAdminClient();

  const { data: flag } = await admin
    .from("attendance_flags")
    .select("id, employee_id, acknowledged")
    .eq("id", flagId)
    .single();

  if (!flag) {
    return NextResponse.json({ error: "Flag not found" }, { status: 404 });
  }

  if (flag.employee_id !== authUser.id) {
    return NextResponse.json(
      { error: "Only the flagged employee can edit this note" },
      { status: 403 }
    );
  }

  if (flag.acknowledged) {
    return NextResponse.json(
      { error: "Cannot edit note after acknowledgement" },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const { error } = await admin
    .from("attendance_flags")
    .update({ employee_notes: note || null })
    .eq("id", flagId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
