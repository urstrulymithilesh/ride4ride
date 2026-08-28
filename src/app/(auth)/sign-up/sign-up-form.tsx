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
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
    </form>
  );
}
