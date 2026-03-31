import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (!currentUser || !["hr_admin", "super_admin"].includes(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  // Prevent self-deletion
  if (userId === authUser.id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Delete from public.users (cascades to schedules, adjustments, etc.)
  const { error: deleteError } = await admin
    .from("users")
    .delete()
    .eq("id", userId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Delete from auth.users
  const { error: authError } = await admin.auth.admin.deleteUser(userId);

  if (authError) {
    return NextResponse.json(
      { error: `User data deleted but auth removal failed: ${authError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
