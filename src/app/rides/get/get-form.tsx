"use client";

import { useActionState, useState } from "react";
import { createGetRide, type RideFormState } from "@/app/rides/actions";
import { PlaceAutocomplete } from "@/components/places/place-autocomplete";
import { SubmitButton } from "@/components/ui/submit-button";
import { WhenFields } from "@/components/rides/when-fields";

const initialState: RideFormState = {};

function AddressField({
  label,
  name,
  placeholder,
  value,
  onValueChange,
  error,
  nearViewer = false,
}: {
  label: string;
  name: string;
  placeholder: string;
  value: string;
  onValueChange: (next: string) => void;
  error?: string;
  nearViewer?: boolean;
}) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-content">
        {label}
      </label>
      <PlaceAutocomplete
        id={id}
        name={name}
        value={value}
        onValueChange={onValueChange}
        source="address"
        nearViewer={nearViewer}
        placeholder={placeholder}
        ariaLabel={label}
        required
        minLength={5}
        invalid={Boolean(error)}
        describedBy={error ? `${id}-error` : undefined}
        inputClassName="input wrap-anywhere"
        dropAlign="self"
        surface="soft"
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function GetForm() {
  const [state, formAction] = useActionState(createGetRide, initialState);
  const fe = state.fieldErrors;
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="rounded-xl bg-primary-soft p-3 text-xs text-content">
        your exact addresses stay private. others only see the city, state, and
        the trip distance — the full addresses are shared only after you and a
        matched rider both agree to proceed.
      </div>

      <AddressField
        label="pickup address"
        name="from_address"
        placeholder="900 university ave, riverside, ca 92521"
        value={fromAddress}
        onValueChange={setFromAddress}
        error={fe?.from_address}
        nearViewer
      />
      <AddressField
        label="drop-off address"
        name="to_address"
        placeholder="111 s grand ave, los angeles, ca 90012"
        value={toAddress}
        onValueChange={setToAddress}
        error={fe?.to_address}
      />

      <WhenFields fieldErrors={fe} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-content">
          description (optional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="number of riders, flexibility, luggage, etc."
          className="input wrap-anywhere"
        />
      </div>

      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingText="looking up addresses…">
        post ride
      </SubmitButton>
    </form>
  );
}
