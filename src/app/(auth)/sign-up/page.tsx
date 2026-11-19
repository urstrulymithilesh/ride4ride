import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sanitizeRedirect } from "@/lib/validations/auth";
import { SignUpForm } from "./sign-up-form";
import { BackButton } from "@/components/ui/back-button";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo: rawRedirect } = await searchParams;
  const redirectTo = sanitizeRedirect(rawRedirect);

  if (await getUser()) redirect(redirectTo);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <BackButton fallback="/" />
        <h1 className="flex-1 text-center text-[17px] font-semibold text-content">
          Create your account
        </h1>
        <span aria-hidden="true" className="block h-11 w-11 shrink-0" />
      </div>
      <div className="text-center">
        <p className="mt-1 text-sm text-muted">
          Join the community to offer and get rides.
        </p>
      </div>

      <SignUpForm redirectTo={redirectTo} />

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link
          href={`/sign-in${rawRedirect ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
          className="font-medium text-primary"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
