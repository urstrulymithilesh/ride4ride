import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sanitizeRedirect } from "@/lib/validations/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "sign in" };

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
      ? "that confirmation link is invalid or has expired. try signing in."
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-content">welcome back</h1>
        <p className="mt-1 text-sm text-muted">
          sign in to post, message, and view ride details.
        </p>
      </div>

      <SignInForm redirectTo={redirectTo} initialError={initialError} />

      <p className="text-center text-sm text-muted">
        new here?{" "}
        <Link
          href={`/sign-up${rawRedirect ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
          className="font-medium text-primary"
        >
          create an account
        </Link>
      </p>
    </div>
  );
}
