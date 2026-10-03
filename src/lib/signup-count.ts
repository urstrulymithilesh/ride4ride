import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { querySignupCount } from "@/lib/signup-count-query";

/**
 * Live signup total for the homepage counter (v3 pilot).
 *
 * Cached 60s: a per-render count(*) would put a database round trip on the
 * hottest page, and a realtime subscription would hold a socket per
 * visitor for a number that changes by the hour. Staleness of ~1 minute
 * is invisible on a counter. Failures resolve to null and the caller
 * hides the counter rather than showing a wrong number.
 */
export const getSignupCount = unstable_cache(
  async (): Promise<number | null> => {
    try {
      return await querySignupCount(createAdminClient());
    } catch {
      return null;
    }
  },
  ["signup-count"],
  { revalidate: 60 },
);
