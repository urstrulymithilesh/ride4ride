import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sanitizeRedirect } from "@/lib/validations/auth";
import { SignInForm } from "./sign-in-form";
import { BackButton } from "@/components/ui/back-button";

export const metadata: Metadata = { title: "Log in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const { redirectTo: rawRedirect, error } = await searchParams;
  const redirectTo = sanitizeRedirect(rawRedirect);

  // Already signed in? Skip the form.
  if (await getUser()) redirect(redirectTo);

  const initialError =
    error === "confirmation_failed"
      ? "That confirmation link is invalid or has expired. Try signing in."
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <BackButton fallback="/" />
        <h1 className="flex-1 text-center text-[17px] font-semibold text-content">
          Welcome back
        </h1>
        <span aria-hidden="true" className="block h-11 w-11 shrink-0" />
      </div>
      <div className="text-center">
        <p className="mt-1 text-sm text-muted">
          Log in to post, message, and view ride details.
        </p>
      </div>

      <SignInForm redirectTo={redirectTo} initialError={initialError} />

      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link
          href={`/sign-up${rawRedirect ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
          className="font-medium text-primary"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
