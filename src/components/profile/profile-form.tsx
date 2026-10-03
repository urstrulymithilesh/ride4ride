"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "@/app/profile/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";

const initialState: ProfileState = {};

export function ProfileForm({
  displayName,
  username,
}: {
  displayName: string;
  username: string;
}) {
  const [state, formAction] = useActionState(updateProfile, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        label="display name"
        name="displayName"
        autoComplete="name"
        defaultValue={displayName}
        placeholder="alex rivera"
        hint="your friendly name shown on posts and in chat. duplicates are fine."
        error={state.fieldErrors?.displayName}
        required
      />
      <TextField
        label="username"
        name="username"
        autoComplete="username"
        defaultValue={username}
        placeholder="alex_r123"
        hint="3–20 characters: letters, numbers, _ — unique to you."
        error={state.fieldErrors?.username}
        required
      />

      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="text-sm text-success" role="status">
          {state.message}
        </p>
      ) : null}

      <SubmitButton pendingText="saving…">save changes</SubmitButton>
    </form>
  );
}
