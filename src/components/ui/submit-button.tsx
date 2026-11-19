"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that shows a pending state while the enclosing <form>'s
 * server action runs. Must be rendered inside a <form>.
 */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "success" | "danger" | "secondary";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`btn btn-${variant} w-full ${className}`}
    >
      {pending ? (pendingText ?? "Please wait…") : children}
    </button>
  );
}
