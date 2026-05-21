import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/utils";
import {
  AUTO_POPULATED_BUILT_IN_KEYS,
  BUILT_IN_IMPORT_SPECS,
} from "@/lib/profile-fields";
import { applyBulkImport, type BulkImportPayload } from "@/lib/pending-changes";

export const maxDuration = 60;

type Result = {
  rowsProcessed: number;
  rowsUpdated: number;
  cellsWritten: number;
  unknownEmails: string[];
  unknownColumns: string[];
  autoPopulatedColumns: string[];
  errors: string[];
  pending?: boolean;
  pending_change_id?: string;
};

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((l) => parseLine(l));
  return { headers, rows };
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
  // hr_support can submit imports but they are queued for admin approval.
  // hr_admin+ apply directly.
  if (!caller || (caller.role !== "hr_support" && !hasRole(caller.role, "hr_admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const queueForApproval = caller.role === "hr_support";

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const text = await file.text();
  const { headers, rows } = parseCSV(text);
  if (headers.length === 0) {
    return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
  }

  const emailIdx = headers.findIndex((h) => h.toLowerCase() === "email");
  if (emailIdx === -1) {
    return NextResponse.json(
      { error: "CSV must include an 'Email' column" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: fieldDefs } = await admin
    .from("profile_fields")
    .select("id, label, built_in_key, field_type, subfields");

  type FieldDef = {
    id: string;
    label: string;
    built_in_key: string | null;
    field_type: string;
    subfields: { key: string; label: string; type: string }[] | null;
  };
  const scalarCustomByLabel = new Map<string, { id: string }>();
  const builtInByLabel = new Map<string, { built_in_key: string }>();
  type MultiRowDef = {
    id: string;
    label: string;
    subfields: { key: string; label: string }[];
  };
  const multiRowFields: MultiRowDef[] = [];
  for (const f of (fieldDefs ?? []) as FieldDef[]) {
    if (f.field_type === "multi_row") {
      multiRowFields.push({
        id: f.id,
        label: f.label,
        subfields: (f.subfields ?? []).map((s) => ({ key: s.key, label: s.label })),
      });
      continue;
    }
    if (f.built_in_key) {
      builtInByLabel.set(f.label.toLowerCase(), { built_in_key: f.built_in_key });
    } else {
      scalarCustomByLabel.set(f.label.toLowerCase(), { id: f.id });
    }
  }

  const multiRowMatch: Array<
    { fieldId: string; rowIndex: number; subfieldKey: string } | null
  > = headers.map(() => null);
  for (let i = 0; i < headers.length; i++) {
    if (i === emailIdx) continue;
    const h = headers[i];
    for (const mrf of multiRowFields) {
      const escaped = mrf.label.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const re = new RegExp(`^${escaped}\\s+(\\d+)\\s+(.+)$`, "i");
      const m = h.match(re);
      if (!m) continue;
      const oneBased = parseInt(m[1], 10);
      const subLabel = m[2].trim().toLowerCase();
      const sub = mrf.subfields.find((s) => s.label.toLowerCase() === subLabel);
      if (!sub) continue;
      multiRowMatch[i] = {
        fieldId: mrf.id,
        rowIndex: oneBased - 1,
        subfieldKey: sub.key,
      };
      break;
    }
  }

  type ColumnPlan =
    | { kind: "custom"; fieldId: string }
    | {
        kind: "builtin";
        column: string;
        parse: (raw: string) => ReturnType<
          typeof BUILT_IN_IMPORT_SPECS["birthday"]["parse"]
        >;
      }
    | { kind: "multirow"; fieldId: string; rowIndex: number; subfieldKey: string }
    | { kind: "auto_populated" }
    | { kind: "unknown" };
  const plans: ColumnPlan[] = headers.map((h, i) => {
    if (i === emailIdx) return { kind: "unknown" };
    const mr = multiRowMatch[i];
    if (mr) return { kind: "multirow", ...mr };
    const lc = h.toLowerCase();
    const custom = scalarCustomByLabel.get(lc);
    if (custom) return { kind: "custom", fieldId: custom.id };
    const builtIn = builtInByLabel.get(lc);
    if (builtIn) {
      if (AUTO_POPULATED_BUILT_IN_KEYS.has(builtIn.built_in_key)) {
        return { kind: "auto_populated" };
      }
      const spec = BUILT_IN_IMPORT_SPECS[builtIn.built_in_key];
      if (spec) return { kind: "builtin", column: spec.column, parse: spec.parse };
    }
    return { kind: "unknown" };
  });

  const unknownColumns = headers.filter(
    (_, i) => i !== emailIdx && plans[i].kind === "unknown"
  );
  const autoPopulatedColumns = headers.filter(
    (_, i) => i !== emailIdx && plans[i].kind === "auto_populated"
  );

  const emailsInFile = rows
    .map((r) => (r[emailIdx] ?? "").trim().toLowerCase())
    .filter(Boolean);
  const { data: usersByEmail } = await admin
    .from("users")
    .select("id, email")
    .in("email", emailsInFile);
  const userIdByEmail = new Map<string, string>();
  for (const u of usersByEmail ?? []) {
    userIdByEmail.set(u.email.toLowerCase(), u.id);
  }

  const result: Result = {
    rowsProcessed: rows.length,
    rowsUpdated: 0,
    cellsWritten: 0,
    unknownEmails: [],
    unknownColumns,
    autoPopulatedColumns,
    errors: [],
  };

  // Build the structured payload — same shape regardless of whether we apply
  // immediately or queue it for approval.
  const payloadRows: BulkImportPayload["rows"] = [];

  for (const row of rows) {
    const email = (row[emailIdx] ?? "").trim().toLowerCase();
    if (!email) continue;
    const userId = userIdByEmail.get(email);
    if (!userId) {
      result.unknownEmails.push(email);
      continue;
    }

    const userPatch: Record<string, unknown> = {};
    const customWrites: Array<{ field_id: string; value: string }> = [];
    const multiRowAcc = new Map<string, Record<string, string>>();

    for (let i = 0; i < headers.length; i++) {
      if (i === emailIdx) continue;
      const plan = plans[i];
      const raw = row[i] ?? "";
      if (raw.trim().length === 0) continue;

      if (plan.kind === "multirow") {
        const key = `${plan.fieldId}|${plan.rowIndex}`;
        const existing = multiRowAcc.get(key) ?? {};
        existing[plan.subfieldKey] = raw.trim();
        multiRowAcc.set(key, existing);
        continue;
      }

      if (plan.kind === "custom") {
        customWrites.push({ field_id: plan.fieldId, value: raw.trim() });
      } else if (plan.kind === "builtin") {
        const parsed = plan.parse(raw);
        if (!parsed.ok) {
          result.errors.push(`${email} → ${headers[i]}: ${parsed.error}`);
          continue;
        }
        if (parsed.value === null) continue;
        userPatch[plan.column] = parsed.value;
      }
    }

    const multiRowWrites: BulkImportPayload["rows"][number]["multi_row_writes"] = [];
    for (const [key, data] of multiRowAcc) {
      const [fieldId, rowIndexStr] = key.split("|");
      multiRowWrites.push({
        field_id: fieldId,
        row_index: parseInt(rowIndexStr, 10),
        data,
      });
    }

    if (
      Object.keys(userPatch).length === 0 &&
      customWrites.length === 0 &&
      multiRowWrites.length === 0
    ) {
      continue;
    }

    payloadRows.push({
      email,
      user_id: userId,
      ...(Object.keys(userPatch).length > 0 && { user_patch: userPatch }),
      ...(customWrites.length > 0 && { custom_field_writes: customWrites }),
      ...(multiRowWrites.length > 0 && { multi_row_writes: multiRowWrites }),
    });
  }

  const payload: BulkImportPayload = { rows: payloadRows };

  if (queueForApproval) {
    const description = `Bulk import — ${payloadRows.length} employee${
      payloadRows.length === 1 ? "" : "s"
    } (${file.name})`;
    const { data: inserted, error: insertError } = await admin
      .from("pending_changes")
      .insert({
        requested_by: authUser.id,
        change_type: "bulk_import",
        target_employee_id: null,
        description,
        payload,
      })
      .select("id")
      .single();
    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }
    result.pending = true;
    result.pending_change_id = inserted.id;
    result.rowsUpdated = payloadRows.length;
    // cellsWritten reflects what *would* be written if approved
    let pendingCells = 0;
    for (const r of payloadRows) {
      pendingCells += Object.keys(r.user_patch ?? {}).length;
      pendingCells += (r.custom_field_writes ?? []).length;
      for (const mr of r.multi_row_writes ?? []) {
        pendingCells += Object.keys(mr.data).length;
      }
    }
    result.cellsWritten = pendingCells;
    return NextResponse.json(result);
  }

  // hr_admin+: apply immediately.
  const applyResult = await applyBulkImport(admin, authUser.id, payload);
  result.rowsUpdated = applyResult.rowsUpdated ?? 0;
  result.cellsWritten = applyResult.cellsWritten ?? 0;
  result.errors.push(...(applyResult.errors ?? []));
  return NextResponse.json(result);
}
