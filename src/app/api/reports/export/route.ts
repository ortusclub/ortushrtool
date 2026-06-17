import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/utils";
import { getSource, type FilterValues } from "@/lib/reports/sources";
import { computeLeaveBalances } from "@/lib/reports/leave-balances";
import { computeNightDifferentialSchedules } from "@/lib/reports/night-differential";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function POST(request: Request) {
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
  if (!caller || !hasRole(caller.role, "hr_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const sourceId: string = body.source;
  const columnIds: string[] = Array.isArray(body.columns) ? body.columns : [];
  const filters: FilterValues = body.filters ?? {};

  const source = getSource(sourceId);
  if (!source) {
    return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  }
  if (columnIds.length === 0) {
    return NextResponse.json({ error: "No columns selected" }, { status: 400 });
  }

  // Map IDs to column defs, preserving the order the user picked.
  const chosen = columnIds
    .map((id) => source.columns.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  const admin = createAdminClient();
  let data: unknown[] = [];

  if (source.id === "leave_balances") {
    // Computed source — bypass the standard query path.
    data = await computeLeaveBalances(admin);
  } else if (source.id === "night_differential") {
    // Computed source — period-bound, derived from per-date attendance_logs
    // schedule snapshots. Takes the date-range filter (the pay period).
    data = await computeNightDifferentialSchedules(admin, filters);
  } else {
    let query = admin.from(source.table).select(source.select);
    for (const [filterId, value] of Object.entries(filters)) {
      query = source.applyFilter(query, filterId, value);
    }
    query = query.order(source.orderBy.column, {
      ascending: source.orderBy.ascending,
    });
    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    data = rows ?? [];
  }

  const headers = chosen.map((c) => c.label);
  const rows = data.map((row) => chosen.map((c) => c.value(row)));

  const csv = [headers, ...rows]
    .map((line) => line.map(csvEscape).join(","))
    .join("\n");

  const today = new Date().toISOString().slice(0, 10);
  const filename = `${source.id}-${today}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
