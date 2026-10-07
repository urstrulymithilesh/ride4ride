"use client";

import { useState } from "react";
import type { FieldErrors } from "@/lib/validations/auth";

function TimingOption({
  value,
  checked,
  onChange,
  title,
  sub,
}: {
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  sub: string;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${
        checked ? "border-primary bg-primary-soft" : "border-hairline"
      }`}
    >
      <input
        type="radio"
        name="timing"
        value={value}
        checked={checked}
        onChange={onChange}
        className="accent-primary"
      />
      <span className="min-w-0">
        <span className="font-medium text-content">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
    </label>
  );
}

/**
 * Current-vs-future toggle plus timing preference. Timing is independent
 * of the toggle: asap / anytime / a specific time of day.
 */
export function WhenFields({ fieldErrors }: { fieldErrors?: FieldErrors }) {
  const [mode, setMode] = useState<"current" | "future">("current");
  const [timing, setTiming] = useState<"asap" | "anytime" | "at">("asap");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-content">when</legend>

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
            <span className="font-medium text-content">now</span>
            <span className="block text-xs text-muted">current / asap</span>
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
            <span className="font-medium text-content">on a date</span>
            <span className="block text-xs text-muted">future ride</span>
          </span>
        </label>
      </div>

      {mode === "future" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ride_date" className="text-sm font-medium text-content">
            ride date
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
            the post stays up until 7 days after the ride.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">
          the post stays up for 7 days.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <TimingOption
          value="asap"
          checked={timing === "asap"}
          onChange={() => setTiming("asap")}
          title="asap"
          sub="right now"
        />
        <TimingOption
          value="anytime"
          checked={timing === "anytime"}
          onChange={() => setTiming("anytime")}
          title="anytime"
          sub="flexible"
        />
        <TimingOption
          value="at"
          checked={timing === "at"}
          onChange={() => setTiming("at")}
          title="time"
          sub="specific"
        />
      </div>

      {timing === "at" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ride_time" className="text-sm font-medium text-content">
            time
          </label>
          <input
            id="ride_time"
            name="ride_time"
            type="time"
            required
            className="input"
          />
          {fieldErrors?.ride_time ? (
            <p className="text-xs text-danger" role="alert">
              {fieldErrors.ride_time}
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
