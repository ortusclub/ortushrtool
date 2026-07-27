import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * HR forwards or dismisses a P2P feedback submission.
 *
 * Forwarding sets one or more recipients and flips the status to "forwarded";
 * each recipient then sees it on their own "feedback forwarded to me" page. No
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
  const { action, recipient_user_id, recipient_user_ids, hr_notes } = body as {
    action?: "forward" | "dismiss";
    recipient_user_id?: string;
    recipient_user_ids?: string[];
    hr_notes?: string;
  };
  if (action !== "forward" && action !== "dismiss") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Accept either the new array or the legacy single id; de-dupe and drop blanks.
  const recipientIds = Array.from(
    new Set(
      [...(recipient_user_ids ?? []), recipient_user_id].filter(
        (v): v is string => typeof v === "string" && v.length > 0
      )
    )
  );
  if (action === "forward" && recipientIds.length === 0) {
    return NextResponse.json(
      { error: "At least one recipient is required to forward" },
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
      recipient_user_ids: action === "forward" ? recipientIds : [],
      // Mirror the first recipient into the legacy single column.
      recipient_user_id: action === "forward" ? recipientIds[0] : null,
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
