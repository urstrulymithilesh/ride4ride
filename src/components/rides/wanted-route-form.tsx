"use client";

import { useActionState, useState } from "react";
import {
  submitWantedRoute,
  type WantedRouteState,
} from "@/app/rides/wanted/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";

const initialState: WantedRouteState = {};

/**
 * "Tell us the route you wanted." A standing form, NOT a zero-result
 * interstitial: the board starts with one route, so an off-route search
 * has nowhere to originate and a zero-result trigger would almost never
 * fire. The rows we most need are for routes we cannot serve at all.
 *
 * Collapsed by default so it never competes with the feed. Works signed
 * out; the row is claimed later if the person makes an account.
 */
export function WantedRouteForm({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, formAction] = useActionState(submitWantedRoute, initialState);

  if (state.message) {
    return (
      <div className="card mt-3 border border-hairline p-4 text-center">
        <p className="text-sm text-content">{state.message}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-dashed border-hairline px-3 text-sm font-medium text-primary"
      >
        Not finding your route? Tell us
      </button>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="card mt-3 flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold text-content">
          Tell us the route you wanted
        </h2>
        <p className="mt-1 text-xs text-muted">
          We only open routes people actually ask for. This tells us where to
          go next — no account needed.
        </p>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium text-content">I wanted to</legend>
        <div className="flex gap-2">
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-hairline px-3 py-2 text-sm text-content">
            <input type="radio" name="role_wanted" value="get" defaultChecked />
            Get a ride
          </label>
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-hairline px-3 py-2 text-sm text-content">
            <input type="radio" name="role_wanted" value="give" />
            Offer a ride
          </label>
        </div>
      </fieldset>

      <div className="flex gap-2">
        <TextField
          label="From city"
          name="from_city"
          placeholder="Chicago"
          error={state.fieldErrors?.from_city}
          required
        />
        <TextField
          label="State"
          name="from_state"
          placeholder="IL"
          error={state.fieldErrors?.from_state}
          required
        />
        <TextField
          label="Airport"
          name="from_airport"
          placeholder="ORD"
          error={state.fieldErrors?.from_airport}
        />
      </div>

      <div className="flex gap-2">
        <TextField
          label="To city"
          name="to_city"
          placeholder="Naperville"
          error={state.fieldErrors?.to_city}
          required
        />
        <TextField
          label="State"
          name="to_state"
          placeholder="IL"
          error={state.fieldErrors?.to_state}
          required
        />
        <TextField
          label="Airport"
          name="to_airport"
          placeholder="optional"
          error={state.fieldErrors?.to_airport}
        />
      </div>

      <div className="flex gap-2">
        <TextField
          label="Any time from"
          name="date_window_start"
          type="date"
          defaultValue={today}
          error={state.fieldErrors?.date_window_start}
          required
        />
        <TextField
          label="Until"
          name="date_window_end"
          type="date"
          defaultValue={today}
          error={state.fieldErrors?.date_window_end}
          required
        />
      </div>

      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <SubmitButton pendingText="Sending…">Send</SubmitButton>
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
