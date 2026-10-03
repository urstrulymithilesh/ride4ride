import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sanitizeRedirect } from "@/lib/validations/auth";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "sign up" };

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
      <div className="text-center">
        <h1 className="text-xl font-semibold text-content">
          create your account
        </h1>
        <p className="mt-1 text-sm text-muted">
          join the community to offer and get rides.
        </p>
      </div>

      <SignUpForm redirectTo={redirectTo} />

      <p className="text-center text-sm text-muted">
        already have an account?{" "}
        <Link
          href={`/sign-in${rawRedirect ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
          className="font-medium text-primary"
        >
          sign in
        </Link>
      </p>
    </div>
  );
}
