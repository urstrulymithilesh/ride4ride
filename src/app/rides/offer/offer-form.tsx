"use client";

import { useActionState } from "react";
import { createOfferRide, type RideFormState } from "@/app/rides/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { WhenFields } from "@/components/rides/when-fields";

const initialState: RideFormState = {};

export function OfferForm() {
  const [state, formAction] = useActionState(createOfferRide, initialState);
  const fe = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-content">From</h2>
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <TextField label="City" name="from_city" error={fe?.from_city} required />
          </div>
          <div className="w-24 shrink-0">
            <TextField label="State" name="from_state" placeholder="CA" error={fe?.from_state} required />
          </div>
        </div>
        <TextField label="ZIP (optional)" name="from_zip" error={fe?.from_zip} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-content">To</h2>
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <TextField label="City" name="to_city" error={fe?.to_city} required />
          </div>
          <div className="w-24 shrink-0">
            <TextField label="State" name="to_state" placeholder="CA" error={fe?.to_state} required />
          </div>
        </div>
        <TextField label="ZIP (optional)" name="to_zip" error={fe?.to_zip} />
      </section>

      <WhenFields fieldErrors={fe} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-content">
          Description (optional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Seats available, timing, luggage, etc."
          className="input wrap-anywhere"
        />
      </div>

      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton variant="success" pendingText="Posting…">
        Post ride
      </SubmitButton>
    </form>
  );
}
