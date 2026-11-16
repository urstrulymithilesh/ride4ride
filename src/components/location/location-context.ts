"use client";

import { createContext, useContext } from "react";

/** Coordinates stay in the browser; nothing here is sent to the server. */
export interface ViewerCoords {
  lat: number;
  lng: number;
  accuracy: number | null;
}

/** LocalStorage key for the persisted device/manual location. */
export const LOCATION_CACHE_KEY = "r4r-viewer-location";

export type LocationStatus =
  | "checking"
  | "prompt"
  | "granted"
  | "denied"
  | "error"
  | "unsupported";

export interface LocationContextValue {
  coords: ViewerCoords | null;
  status: LocationStatus;
  request: () => void;
  /** Persist a manually chosen city center and grant the gate. */
  setManualLocation: (next: ViewerCoords) => void;
}

export const LocationContext = createContext<LocationContextValue | null>(
  null,
);

export function useViewerLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error("useViewerLocation must be used inside <LocationProvider>");
  }
  return ctx;
}
