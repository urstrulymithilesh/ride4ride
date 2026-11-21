"use client";

import { useActionState } from "react";
import { signIn, type AuthState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";

const initialState: AuthState = {};

export function SignInForm({
  redirectTo,
  initialError,
}: {
  redirectTo: string;
  initialError?: string;
}) {
  const [state, formAction] = useActionState(signIn, initialState);
  const error = state.error ?? initialError;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <TextField
        label="Phone number"
        name="identifier"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="Phone number"
        error={state.fieldErrors?.identifier}
        required
        hideLabel
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        error={state.fieldErrors?.password}
        required
        hideLabel
      />
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
    </form>
  );
}
