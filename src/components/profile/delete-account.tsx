"use client";

import { useActionState, useState } from "react";
import { deleteAccount, type ProfileState } from "@/app/settings/actions";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: ProfileState = {};

/**
 * Danger zone: permanent account deletion. Two steps — arm, then type
 * DELETE — so it can't happen by accident. Success redirects home.
 */
export function DeleteAccountForm() {
  const [state, formAction] = useActionState(deleteAccount, initialState);
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="btn min-h-11 border border-danger/60 px-4 text-sm font-semibold text-danger hover:bg-danger/10"
      >
        Delete account
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm leading-6 text-muted">
        This permanently deletes your profile, posts, chats, and everything
        tied to your account. There is no undo.
      </p>
      <label
        htmlFor="delete-confirm"
        className="text-sm font-medium text-content"
      >
        Type DELETE to confirm
      </label>
      <input
        id="delete-confirm"
        name="confirm"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        placeholder="DELETE"
        className="input"
      />
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <SubmitButton pendingText="Deleting…">Delete forever</SubmitButton>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="btn btn-secondary min-h-11 px-4 text-sm"
        >
          Keep my account
        </button>
      </div>
    </form>
  );
}
