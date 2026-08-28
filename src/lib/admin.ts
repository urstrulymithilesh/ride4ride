import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";

/**
 * True if the current user is an admin. Reads the caller's OWN profile
 * (readable under RLS); `is_admin` can't be self-set (column privilege +
 * grant of UPDATE only on display_name), so this flag is trustworthy.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle<{ is_admin: boolean }>();
  return Boolean(data?.is_admin);
}
