import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  // Auth check
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

  const { date } = await request.json();
  if (!date) {
    return NextResponse.json({ error: "Date required" }, { status: 400 });
  }

  // Call the cron endpoint internally
  const cronUrl = `${process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin")}/api/cron/desktime-sync?date=${date}`;

  const response = await fetch(cronUrl, {
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
  });

  const result = await response.json();
  return NextResponse.json(result);
}
