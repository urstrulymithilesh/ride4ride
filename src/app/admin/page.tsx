import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isCurrentUserAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPlace } from "@/lib/utils/format";
import { setReportStatus, takedownRide, banUser, unbanUser } from "./actions";
import type { Report } from "@/types";

export const metadata: Metadata = { title: "Admin · Reports", robots: { index: false } };

export default async function AdminPage() {
  // Hide the route's existence from non-admins.
  if (!(await isCurrentUserAdmin())) notFound();

  const admin = createAdminClient();
  const { data: reports, error: reportsError } = await admin
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<Report[]>();

  // Same bug class as the rides feed, on the moderation surface: a failed
  // query would render "no reports", which reads as "nothing to action".
  // Throw rather than show a reassuring empty queue.
  if (reportsError) {
    console.error("[admin] reports query failed:", reportsError.message, reportsError);
    throw new Error("Couldn't load reports.");
  }

  const list = reports ?? [];
  const userIds = new Set<string>();
  const rideIds = new Set<string>();
  for (const r of list) {
    userIds.add(r.reporter_id);
    if (r.target_user_id) userIds.add(r.target_user_id);
    if (r.target_ride_id) rideIds.add(r.target_ride_id);
  }

  const [{ data: profiles }, { data: rides }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, display_name, is_banned")
      .in("id", Array.from(userIds).length ? Array.from(userIds) : ["_"]),
    admin
      .from("rides")
      .select("id, from_city, from_state, to_city, to_state, status")
      .in("id", Array.from(rideIds).length ? Array.from(rideIds) : ["_"]),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const rideMap = new Map((rides ?? []).map((r) => [r.id, r]));
  const openCount = list.filter((r) => r.status === "open").length;

  return (
    <main className="w-full flex-1 px-4 py-6">
      <h1 className="text-xl font-semibold text-content">Reports</h1>
      <p className="mt-1 mb-4 text-sm text-muted">
        {openCount} open · {list.length} total
      </p>

      {list.length === 0 ? (
        <p className="card border border-dashed border-hairline bg-transparent p-8 text-center text-sm text-muted">
          No reports.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => {
            const reporter = profileMap.get(r.reporter_id);
            const targetUser = r.target_user_id
              ? profileMap.get(r.target_user_id)
              : null;
            const targetRide = r.target_ride_id
              ? rideMap.get(r.target_ride_id)
              : null;

            return (
              <li key={r.id} className="card">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="chip bg-surface-2 uppercase tracking-wide text-muted">
                    {r.target_type}
                  </span>
                  <span className="chip bg-surface-2 text-content">{r.reason}</span>
                  <span
                    className={`chip ${
                      r.status === "open"
                        ? "bg-danger-soft text-danger"
                        : "bg-surface-2 text-muted"
                    }`}
                  >
                    {r.status}
                  </span>
                  <span className="text-faint">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>

                <p className="mt-2 text-sm text-muted">
                  Reported by {reporter?.display_name ?? "unknown"}.
                </p>

                {/* Target */}
                <div className="mt-2 text-sm">
                  {targetRide ? (
                    <Link
                      href={`/rides/${r.target_ride_id}`}
                      className="wrap-anywhere text-primary"
                    >
                      Post: {formatPlace(targetRide.from_city, targetRide.from_state)}{" "}
                      → {formatPlace(targetRide.to_city, targetRide.to_state)} (
                      {targetRide.status})
                    </Link>
                  ) : null}
                  {targetUser ? (
                    <span className="wrap-anywhere text-content">
                      User: {targetUser.display_name}
                      {targetUser.is_banned ? " (banned)" : ""}
                    </span>
                  ) : null}
                </div>

                {r.details ? (
                  <p className="wrap-anywhere mt-2 rounded-lg bg-surface-2 p-2 text-sm text-muted">
                    {r.details}
                  </p>
                ) : null}

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
                  {r.target_ride_id && targetRide?.status !== "cancelled" ? (
                    <form action={takedownRide}>
                      <input type="hidden" name="rideId" value={r.target_ride_id} />
                      <AdminButton label="Take down post" danger />
                    </form>
                  ) : null}

                  {r.target_user_id ? (
                    targetUser?.is_banned ? (
                      <form action={unbanUser}>
                        <input type="hidden" name="userId" value={r.target_user_id} />
                        <AdminButton label="Unban user" />
                      </form>
                    ) : (
                      <form action={banUser}>
                        <input type="hidden" name="userId" value={r.target_user_id} />
                        <AdminButton label="Ban user" danger />
                      </form>
                    )
                  ) : null}

                  <form action={setReportStatus} className="ml-auto flex items-center gap-1">
                    <input type="hidden" name="reportId" value={r.id} />
                    <select
                      name="status"
                      defaultValue={r.status}
                      className="input h-11 w-auto text-xs"
                    >
                      <option value="open">open</option>
                      <option value="reviewed">reviewed</option>
                      <option value="actioned">actioned</option>
                      <option value="dismissed">dismissed</option>
                    </select>
                    <AdminButton label="Save" />
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function AdminButton({
  label,
  danger,
}: {
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="submit"
      className={`btn ${danger ? "btn-danger" : "btn-secondary"} px-3 text-xs`}
    >
      {label}
    </button>
  );
}
