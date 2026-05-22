import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole, displayName } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { HOLIDAY_COUNTRY_LABELS, type HolidayCountry, type OneOnOne, type User } from "@/types/database";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/\r?\n/g, " ");
  if (/[",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: caller } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();
  if (!caller || !hasRole(caller.role, "hr_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const subject = url.searchParams.get("subject");
  const host = url.searchParams.get("host");
  const dept = url.searchParams.get("dept");
  const country = url.searchParams.get("country");
  const dateFrom = url.searchParams.get("from");
  const dateTo = url.searchParams.get("to");
  const includePrivate = url.searchParams.get("include_private") === "1";

  const admin = createAdminClient();
  let query = admin.from("one_on_ones").select("*").order("scheduled_date", {
    ascending: false,
  });
  if (subject) query = query.eq("employee_id", subject);
  if (host) query = query.eq("manager_id", host);
  if (dateFrom) query = query.gte("scheduled_date", dateFrom);
  if (dateTo) query = query.lte("scheduled_date", dateTo);

  const { data: rows } = await query;
  let oneOnOnes = (rows ?? []) as OneOnOne[];

  // Department / country filter — need user records keyed by id.
  const userIds = Array.from(
    new Set(
      oneOnOnes.flatMap((o) =>
        [o.employee_id, o.manager_id, ...(o.participants ?? [])].filter(
          (id): id is string => !!id
        )
      )
    )
  );
  const { data: usersData } = userIds.length
    ? await admin
        .from("users")
        .select(
          "id, full_name, preferred_name, first_name, last_name, email, department, holiday_country"
        )
        .in("id", userIds)
    : { data: [] };
  const userById = new Map<
    string,
    Pick<
      User,
      | "id"
      | "full_name"
      | "preferred_name"
      | "first_name"
      | "last_name"
      | "email"
      | "department"
      | "holiday_country"
    >
  >();
  for (const u of (usersData ?? []) as Pick<
    User,
    | "id"
    | "full_name"
    | "preferred_name"
    | "first_name"
    | "last_name"
    | "email"
    | "department"
    | "holiday_country"
  >[]) {
    userById.set(u.id, u);
  }

  if (dept) {
    oneOnOnes = oneOnOnes.filter(
      (o) => userById.get(o.employee_id)?.department === dept
    );
  }
  if (country) {
    oneOnOnes = oneOnOnes.filter(
      (o) => userById.get(o.employee_id)?.holiday_country === country
    );
  }

  const header = [
    "Date",
    "Subject (employee)",
    "Subject email",
    "Subject dept",
    "Subject country",
    "Host (manager of record)",
    "Other attendees",
    "Agenda",
    "Shared notes",
    ...(includePrivate ? ["Facilitator private notes", "Subject private notes"] : []),
    "Created by",
    "Created at",
  ];
  const lines: string[] = [header.map(csvCell).join(",")];
  for (const o of oneOnOnes) {
    const subjectU = userById.get(o.employee_id);
    const hostU = o.manager_id ? userById.get(o.manager_id) : null;
    const otherIds = (o.participants ?? []).filter(
      (id) => id && id !== o.manager_id
    );
    const others = otherIds
      .map((id) => {
        const u = userById.get(id);
        return u ? displayName(u) : id;
      })
      .join("; ");
    const createdByU = o.created_by ? userById.get(o.created_by) : null;
    const row = [
      format(parseISO(o.scheduled_date), "yyyy-MM-dd"),
      subjectU ? displayName(subjectU) : "",
      subjectU?.email ?? "",
      subjectU?.department ?? "",
      subjectU?.holiday_country
        ? HOLIDAY_COUNTRY_LABELS[subjectU.holiday_country as HolidayCountry] ??
          subjectU.holiday_country
        : "",
      hostU ? displayName(hostU) : "",
      others,
      o.agenda ?? "",
      o.shared_notes ?? "",
      ...(includePrivate
        ? [o.manager_private_notes ?? "", o.employee_private_notes ?? ""]
        : []),
      createdByU ? displayName(createdByU) : "",
      o.created_at,
    ];
    lines.push(row.map(csvCell).join(","));
  }

  const csv = lines.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="one-on-ones-${format(new Date(), "yyyy-MM-dd")}.csv"`,
    },
  });
}
