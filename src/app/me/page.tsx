import { redirect } from "next/navigation";
import { getProfile, getUser } from "@/lib/auth";

/**
 * Own-profile shortcut for the dock icon. Server-side, so there is no
 * fetch timing to miss: signed in → /<username>, signed out → sign-in
 * (which bounces back here after login).
 */
export default async function MePage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?redirectTo=/me");
  const profile = await getProfile();
  if (!profile) redirect("/");
  redirect(`/${profile.username}`);
}
