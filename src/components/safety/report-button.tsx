"use client";

import { useActionState, useState } from "react";
import { reportContent, type ReportState } from "@/app/safety/actions";
import type { ReportReason } from "@/types";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "scam", label: "Scam / fraud" },
  { value: "safety", label: "Safety concern" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Other" },
];

const initial: ReportState = {};

/**
 * Small "Report" control that expands into a form. Works for a post
 * (targetRideId) or a user (targetUserId).
 */
export function ReportButton({
  targetType,
  targetRideId,
  targetUserId,
  label = "Report",
}: {
  targetType: "post" | "user";
  targetRideId?: string;
  targetUserId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(reportContent, initial);

  if (state.done) {
    return (
      <p className="text-xs text-muted" role="status">
        Thanks — this report has been sent to our team for review.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center text-xs font-medium text-danger"
      >
        {label}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-2 flex flex-col gap-2 rounded-xl border border-hairline p-3"
    >
      <input type="hidden" name="targetType" value={targetType} />
      {targetRideId ? (
        <input type="hidden" name="targetRideId" value={targetRideId} />
      ) : null}
      {targetUserId ? (
        <input type="hidden" name="targetUserId" value={targetUserId} />
      ) : null}

      <label className="text-xs font-medium text-content">
        Reason
        <select
          name="reason"
          defaultValue=""
          required
          className="input mt-1"
        >
          <option value="" disabled>
            Select a reason…
          </option>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      {state.fieldErrors?.reason ? (
        <p className="text-xs text-danger" role="alert">
          {state.fieldErrors.reason}
        </p>
      ) : null}

      <textarea
        name="details"
        rows={2}
        placeholder="Add any details (optional)"
        className="input wrap-anywhere"
      />

      {state.error ? (
        <p className="text-xs text-danger" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" className="btn btn-danger flex-1">
          Submit report
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-ghost"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
