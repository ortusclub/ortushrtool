import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * HR forwards or dismisses a P2P feedback submission.
 *
 * Forwarding sets the recipient and flips the status to "forwarded"; the
 * recipient then sees it on their own "feedback forwarded to me" page. No
 * email is sent — delivery is in-app.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();
  if (!caller || !["hr_admin", "super_admin"].includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { action, recipient_user_id, hr_notes } = body as {
    action?: "forward" | "dismiss";
    recipient_user_id?: string;
    hr_notes?: string;
  };
  if (action !== "forward" && action !== "dismiss") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (action === "forward" && !recipient_user_id) {
    return NextResponse.json(
      { error: "recipient_user_id is required to forward" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: feedback } = await admin
    .from("p2p_feedback")
    .select("id, status")
    .eq("id", id)
    .single();
  if (!feedback) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (feedback.status !== "new") {
    return NextResponse.json(
      { error: "This feedback has already been actioned." },
      { status: 409 }
    );
  }

  const { error } = await admin
    .from("p2p_feedback")
    .update({
      status: action === "forward" ? "forwarded" : "dismissed",
      recipient_user_id: action === "forward" ? recipient_user_id : null,
      hr_notes: hr_notes?.trim() || null,
      reviewed_by: authUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
