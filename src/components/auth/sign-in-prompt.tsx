import Link from "next/link";
import { sanitizeRedirect } from "@/lib/validations/auth";

/**
 * "Sign in to continue" card shown when an unauthenticated user reaches
 * protected content or a protected action. Preserves where they were headed
 * via `redirectTo` so they land back here after signing in.
 */
export function SignInPrompt({
  action = "continue",
  redirectTo,
  compact = false,
}: {
  /** What the user is trying to do, e.g. "message this rider". */
  action?: string;
  redirectTo?: string;
  compact?: boolean;
}) {
  const safe = sanitizeRedirect(redirectTo);
  const q = safe !== "/" ? `?redirectTo=${encodeURIComponent(safe)}` : "";

  return (
    <div
      className={`card text-center ${compact ? "p-4" : "p-6"}`}
    >
      <p className="text-sm font-medium text-content">Sign in to {action}</p>
      <p className="mt-1 text-sm text-muted">
        Browsing is open to everyone, but you&apos;ll need an account for this.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Link href={`/sign-in${q}`} className="btn btn-primary flex-1">
          Sign in
        </Link>
        <Link href={`/sign-up${q}`} className="btn btn-secondary flex-1">
          Create account
        </Link>
      </div>
    </div>
  );
}
