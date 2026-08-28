import "server-only";

/**
 * Verify a request came from our scheduler. Vercel Cron automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set;
 * external schedulers (cron-job.org, pg_cron via pg_net) can send the same
 * header. Returns true if authorized.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if not configured
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

/** Pre-expiry notice window: notify owners this long before a post expires. */
export const PRE_EXPIRY_NOTICE_MS = 60 * 60 * 1000; // 1 hour
