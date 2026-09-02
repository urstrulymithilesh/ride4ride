"use client";

import { useState } from "react";
import type { FieldErrors } from "@/lib/validations/auth";

/**
 * Current-vs-future toggle. "Current" shows an auto-expiry choice; "Future"
 * reveals a required date input (and expiry is derived from that date).
 */
export function WhenFields({ fieldErrors }: { fieldErrors?: FieldErrors }) {
  const [mode, setMode] = useState<"current" | "future">("current");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-content">When</legend>

      <div className="grid grid-cols-2 gap-2">
        <label
          className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${
            mode === "current"
              ? "border-primary bg-primary-soft"
              : "border-hairline"
          }`}
        >
          <input
            type="radio"
            name="mode"
            value="current"
            checked={mode === "current"}
            onChange={() => setMode("current")}
            className="accent-primary"
          />
          <span className="min-w-0">
            <span className="font-medium text-content">Now</span>
            <span className="block text-xs text-muted">Current / ASAP</span>
          </span>
        </label>

        <label
          className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${
            mode === "future"
              ? "border-primary bg-primary-soft"
              : "border-hairline"
          }`}
        >
          <input
            type="radio"
            name="mode"
            value="future"
            checked={mode === "future"}
            onChange={() => setMode("future")}
            className="accent-primary"
          />
          <span className="min-w-0">
            <span className="font-medium text-content">On a date</span>
            <span className="block text-xs text-muted">Future ride</span>
          </span>
        </label>
      </div>

      {mode === "future" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ride_date" className="text-sm font-medium text-content">
            Ride date
          </label>
          <input
            id="ride_date"
            name="ride_date"
            type="date"
            min={today}
            className="input"
          />
          {fieldErrors?.ride_date ? (
            <p className="text-xs text-danger" role="alert">
              {fieldErrors.ride_date}
            </p>
          ) : null}
          <p className="text-xs text-muted">
            The post stays up until 7 days after the ride.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">
          The post stays up for 7 days.
        </p>
      )}
    </fieldset>
  );
}
