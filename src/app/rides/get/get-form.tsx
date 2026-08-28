"use client";

import { useActionState } from "react";
import { createGetRide, type RideFormState } from "@/app/rides/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { WhenFields } from "@/components/rides/when-fields";

const initialState: RideFormState = {};

export function GetForm() {
  const [state, formAction] = useActionState(createGetRide, initialState);
  const fe = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="rounded-xl bg-primary-soft p-3 text-xs text-content">
        Your exact addresses stay private. Others only see the city, state, and
        the trip distance — the full addresses are shared only after you and a
        matched rider both agree to proceed.
      </div>

      <TextField
        label="Pickup address"
        name="from_address"
        autoComplete="off"
        placeholder="900 University Ave, Riverside, CA 92521"
        error={fe?.from_address}
        required
      />
      <TextField
        label="Drop-off address"
        name="to_address"
        autoComplete="off"
        placeholder="111 S Grand Ave, Los Angeles, CA 90012"
        error={fe?.to_address}
        required
      />

      <WhenFields fieldErrors={fe} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-content">
          Description (optional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Number of riders, flexibility, luggage, etc."
          className="input wrap-anywhere"
        />
      </div>

      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingText="Looking up addresses…">
        Post ride
      </SubmitButton>
    </form>
  );
}
