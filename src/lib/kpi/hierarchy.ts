import type { SupabaseClient } from "@supabase/supabase-js";

interface ReportUser {
  id: string;
  full_name: string;
  email: string;
  manager_id: string | null;
}

export interface HierarchyResult {
  directReports: ReportUser[];
  indirectReports: ReportUser[];
  allReportIds: string[];
}

/**
 * Fetches all direct and indirect reports for a manager using iterative BFS.
 * Returns them categorized as direct vs indirect.
 */
export async function getAllReports(
  supabase: SupabaseClient,
  managerId: string
): Promise<HierarchyResult> {
  // First level = direct reports
  const { data: directReports } = await supabase
    .from("users")
    .select("id, full_name, email, manager_id")
    .eq("manager_id", managerId)
    .eq("is_active", true)
    .order("full_name");

  const direct: ReportUser[] = directReports ?? [];
  const indirect: ReportUser[] = [];
  const visited = new Set<string>([managerId]);

  // BFS from direct report IDs to find indirect reports
  const queue = direct.map((r) => r.id);
  for (const id of direct) visited.add(id.id);

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    const { data: reports } = await supabase
      .from("users")
      .select("id, full_name, email, manager_id")
      .eq("manager_id", currentId)
      .eq("is_active", true)
      .order("full_name");

    for (const report of reports ?? []) {
      if (!visited.has(report.id)) {
        visited.add(report.id);
        indirect.push(report);
        queue.push(report.id);
      }
    }
  }

  const allReportIds = [...direct, ...indirect].map((r) => r.id);

  return { directReports: direct, indirectReports: indirect, allReportIds };
}
