import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Raw signup count query, kept free of `server-only` and `next/cache`
 * (neither resolves under vitest) so the counter contract is unit-tested
 * in signup-count-query.test.ts. The cached wrapper in signup-count.ts is
 * a thin shell around this.
 */
export async function querySignupCount(
  db: Pick<SupabaseClient, "from">,
): Promise<number | null> {
  const { count, error } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (error || count === null) return null;
  return count;
}
