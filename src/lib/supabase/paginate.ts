// Supabase/PostgREST caps a single response at 1000 rows (server-side
// max-rows), silently truncating larger result sets. Any company-wide read
// that can exceed 1000 rows (e.g. all schedules: ~1 row per employee per day)
// must page through the result instead of relying on a single request.
//
// Pass a builder that applies `.range(from, to)` to an *ordered* query so the
// windows are stable across requests:
//
//   const rows = await fetchAllRows((from, to) =>
//     supabase.from("schedules").select("*").order("id").range(from, to)
//   );

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  buildQuery: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}
