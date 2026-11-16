import type { PlaceKind } from "@/lib/places";

/**
 * Kinds that can appear in the shared place dropdown. City/airport/
 * university come from the vendored datasets; "address" comes from the
 * Mapbox-backed street-address search.
 */
export type PlaceOptionKind = PlaceKind | "address";

export interface PlaceOption {
  kind: PlaceOptionKind;
  /** Primary line, e.g. "Naperville, IL" or "1014 Bradford Hicks Drive". */
  title: string;
  /** Secondary line, e.g. "United States" or "Livingston, TN, USA". */
  sub: string;
  /** Machine-usable pick value, e.g. "Naperville, IL". */
  value: string;
  /**
   * Optional coordinates from the provider. Only used to rank address
   * suggestions in the browser against the viewer's device location —
   * they are never sent back to the server.
   */
  lat?: number;
  lng?: number;
  /**
   * Text to put in the field when picked. Defaults to `title`.
   *
   * Addresses set this to the full address so the server geocoder gets
   * house number + city + state + ZIP, while the dropdown row can stay
   * compact (street on line one, city/state/country on line two).
   */
  fill?: string;
}
