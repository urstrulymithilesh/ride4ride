"use client";

import { useActionState, useState } from "react";
import {
  changePassword,
  updateProfile,
  type ProfileState,
} from "@/app/settings/actions";
import { TextField } from "@/components/ui/text-field";
import { SubmitButton } from "@/components/ui/submit-button";

const emptyState: ProfileState = {};

function PencilIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className="wrap-anywhere text-content">{value}</dd>
    </div>
  );
}

/**
 * Profile details with inline editing. View mode is a definition list;
 * the pencil (top-right) flips the same card into a form. No separate
 * edit section.
 */
export function ProfileDetails({
  username,
  displayName,
  dob,
  dobDisplay,
  email,
  phone,
}: {
  username: string;
  displayName: string;
  dob: string;
  dobDisplay: string;
  email: string;
  phone: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateProfile, emptyState);
  const fe = state.fieldErrors;

  return (
    <section aria-label="Profile details" className="card relative mt-4 p-5">
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        aria-label={editing ? "Cancel editing" : "Edit profile"}
        aria-expanded={editing}
        className="absolute right-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted hover:bg-white/10 hover:text-content"
      >
        <PencilIcon />
      </button>

      {!editing ? (
        <dl className="grid grid-cols-2 gap-3 pr-10 text-sm">
          <Detail label="Username" value={`@${username}`} />
          <Detail label="Name" value={displayName} />
          <Detail label="Date of birth" value={dobDisplay} />
          <Detail label="Email" value={email} />
          <Detail label="Phone number" value={phone || "—"} />
        </dl>
      ) : (
        <form action={formAction} className="flex flex-col gap-3 pr-10">
          <TextField
            label="Username"
            name="username"
            defaultValue={username}
            error={fe?.username}
            required
          />
          <TextField
            label="Name"
            name="displayName"
            defaultValue={displayName}
            error={fe?.displayName}
            required
          />
          <TextField
            label="Date of birth"
            name="dob"
            type="date"
            defaultValue={dob}
            error={fe?.dob}
            required
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            defaultValue={email}
            error={fe?.email}
            required
          />
          <TextField
            label="Phone number"
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={phone}
            error={fe?.phone}
          />
          {state.error ? (
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.message ? (
            <p className="text-sm text-white" role="status">
              {state.message}
            </p>
          ) : null}
          <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        </form>
      )}
    </section>
  );
}

/** Password change, sitting right below the profile section. */
export function PasswordForm() {
  const [state, formAction] = useActionState(changePassword, emptyState);
  const fe = state.fieldErrors;

  return (
    <section aria-label="Change password" className="card mt-3 p-5">
      <h2 className="text-sm font-semibold text-content">Change password</h2>
      <form action={formAction} className="mt-3 flex flex-col gap-3">
        <TextField
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          error={fe?.newPassword}
          required
        />
        <TextField
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          error={fe?.confirmPassword}
          required
        />
        {state.error ? (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p className="text-sm text-white" role="status">
            {state.message}
          </p>
        ) : null}
        <SubmitButton pendingText="Saving…">Change password</SubmitButton>
      </form>
    </section>
  );
}
