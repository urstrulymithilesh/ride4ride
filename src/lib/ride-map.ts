/**
 * Wire shape for a map pin. Coordinates are deliberately approximate
 * city-level points (never read from `ride_locations`), so this type is
 * safe to send to the browser.
 */
export interface MapRide {
  id: string;
  /** Near-pickup point (pre-jittered at post time, never the exact point). */
  lat: number;
  lng: number;
  /** Pill label: "2.0 miles • Now" (distance plus timing). */
  miles: string | null;
  /** Pickup city/state (public, coarse) — feeds the offer-tab clusters. */
  city: string;
  state: string;
}
