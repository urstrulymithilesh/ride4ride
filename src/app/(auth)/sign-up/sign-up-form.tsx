"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";

const initialState: AuthState = {};

export function SignUpForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState(signUp, initialState);

  if (state.message) {
    return (
      <div
        role="status"
        className="rounded-xl bg-success-soft p-4 text-sm text-content"
      >
        {state.message}{" "}
        <Link href="/sign-in" className="font-medium text-success">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <TextField
        label="Display name"
        name="displayName"
        autoComplete="name"
        placeholder="Alex Rivera"
        error={state.fieldErrors?.displayName}
        required
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@school.edu"
        error={state.fieldErrors?.email}
        required
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        error={state.fieldErrors?.password}
        required
      />
      {/* 18+ attestation and Terms acceptance. Recorded on the profile at
          account creation (migration 0009). Self-declared, not verified:
          we do not collect date of birth. */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="ageConfirmed18"
          className="flex cursor-pointer items-start gap-2.5 text-sm text-content"
        >
          <input
            id="ageConfirmed18"
            name="ageConfirmed18"
            type="checkbox"
            required
            aria-describedby={
              state.fieldErrors?.ageConfirmed18 ? "ageConfirmed18-error" : undefined
            }
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            I am 18 or older, and I agree to the{" "}
            <Link href="/terms" className="font-medium text-primary underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-primary underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {state.fieldErrors?.ageConfirmed18 ? (
          <p id="ageConfirmed18-error" className="text-xs text-danger" role="alert">
            {state.fieldErrors.ageConfirmed18}
          </p>
        ) : null}
      </div>

      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
    </form>
  );
}
