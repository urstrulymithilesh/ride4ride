import { getUser } from "@/lib/auth";
import { SignInPrompt } from "./sign-in-prompt";

/**
 * Server-side gate for protected content on otherwise-public pages.
 * Renders `children` when signed in; otherwise renders a "sign in to continue"
 * prompt in place. Unlike `requireUser()`, this does NOT redirect — the user
 * stays on the public page (e.g. a listing) and sees the prompt inline.
 *
 * Use `requireUser()` for whole pages that should redirect; use <AuthGate>
 * for sections/actions embedded in a public page.
 *
 * @example
 * <AuthGate action="view full trip details" redirectTo={`/rides/${id}`}>
 *   <RideDetails ride={ride} />
 * </AuthGate>
 */
export async function AuthGate({
  action,
  redirectTo,
  compact,
  children,
  fallback,
}: {
  action?: string;
  redirectTo?: string;
  compact?: boolean;
  children: React.ReactNode;
  /** Optional custom fallback; defaults to <SignInPrompt>. */
  fallback?: React.ReactNode;
}) {
  const user = await getUser();
  if (user) return <>{children}</>;
  return (
    <>
      {fallback ?? (
        <SignInPrompt action={action} redirectTo={redirectTo} compact={compact} />
      )}
    </>
  );
}
