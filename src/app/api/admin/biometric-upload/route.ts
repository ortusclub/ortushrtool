import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/utils";
import { ingestPunches } from "@/lib/biometric/ingest";
import type { ParsedPunch } from "@/lib/biometric/parse";

export const maxDuration = 60;

interface RequestBody {
  rows?: ParsedPunch[];
  source_filename?: string | null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: caller } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!caller || !hasRole(caller.role, "hr_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Matching, name-checking and the dedupe upsert all live in the shared
  // ingest so this page, the scripted ingest and the device feed can't drift.
  try {
    const result = await ingestPunches(admin, rows, {
      sourceFilename: body.source_filename ?? null,
      uploadedBy: user.id,
      checkNames: true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingest failed" },
      { status: 500 }
    );
  }
}
