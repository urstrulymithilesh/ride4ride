import type { PlaceOption } from "@/lib/place-option";

/**
 * Mapbox Geocoding feature shape (only the fields the address dropdown
 * needs). Kept provider-shaped and free of `server-only` so the
 * formatting rules can be unit-tested without a token or network call.
 */
export interface MapboxAddressFeature {
  place_name?: string;
  /** Street name, e.g. "Bradford Hicks Drive". */
  text?: string;
  /** House number, e.g. "1014". */
  address?: string;
  place_type?: string[];
  /** [longitude, latitude] */
  center?: [number, number];
  context?: Array<{
    id: string;
    text: string;
    /** Region/country code, e.g. "US-TN" or "us". */
    short_code?: string;
  }>;
}

const DEFAULT_LIMIT = 5;

function contextItem(
  feature: MapboxAddressFeature,
  prefix: string,
): { text: string; short_code?: string } | undefined {
  return feature.context?.find((c) => c.id.startsWith(prefix));
}

/**
 * "US-TN" -> "TN"; a full name such as "Tennessee" passes through.
 * Mapbox supplies short_code for US regions, but the fallback keeps the
 * formatter from turning a missing code into an empty label.
 */
function regionLabel(item?: { text: string; short_code?: string }): string {
  if (!item) return "";
  const raw = item.short_code?.replace(/^us-/i, "") ?? item.text;
  return raw.length === 2 ? raw.toUpperCase() : raw;
}

function countryLabel(item?: { text: string; short_code?: string }): string {
  if (!item) return "";
  if (item.short_code?.toLowerCase() === "us") return "USA";
  if (item.text === "United States") return "USA";
  return item.text;
}

/** "1014" + "Bradford Hicks Drive" -> "1014 Bradford Hicks Drive". */
function streetLine(feature: MapboxAddressFeature): string {
  const number = feature.address?.trim() ?? "";
  const street = feature.text?.trim() ?? "";
  if (!number) return street;
  if (!street) return number;
  // Some providers repeat the number in `text`; don't print it twice.
  return street.startsWith(`${number} `) ? street : `${number} ${street}`;
}

/**
 * Turn Mapbox features into dropdown rows.
 *
 * Title = street line, sub = city/state/country, fill = the complete
 * `place_name` (house number + city + state + ZIP + country) so the
 * existing server geocoder receives an unambiguous address.
 */
export function addressOptionsFromMapbox(
  features: readonly MapboxAddressFeature[],
  limit = DEFAULT_LIMIT,
): PlaceOption[] {
  const out: PlaceOption[] = [];
  const seen = new Set<string>();

  for (const feature of features) {
    if (out.length >= limit) break;

    const country = contextItem(feature, "country");
    const countryCode = country?.short_code?.toLowerCase();
    // Mapbox is queried with country=us, but verify when the response
    // carries a country code so a provider change cannot leak non-US rows.
    if (countryCode && countryCode !== "us") continue;

    const full = feature.place_name?.trim() ?? "";
    const street = streetLine(feature);
    const title = street || full.split(",")[0]?.trim() || "";
    if (!title) continue;

    // Only offer a complete street address. A bare street name cannot
    // become a precise pickup point, and the form explicitly asks for a
    // full address. Require a house number and a street name after it.
    const hasHouseNumber =
      Boolean(feature.address?.trim()) || /^\d+\s+\S/.test(title);
    const hasStreetName = title.replace(/^\d+\s+/, "").trim().length > 0;
    if (!hasHouseNumber || !hasStreetName) continue;

    const city =
      contextItem(feature, "place")?.text ??
      contextItem(feature, "locality")?.text ??
      "";
    const region = regionLabel(contextItem(feature, "region"));
    const countryName = countryLabel(country);
    const sub =
      [city, region, countryName].filter(Boolean).join(", ") || "USA";

    const fill = full || [title, sub].filter(Boolean).join(", ");
    const key = fill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const [lng, lat] = feature.center ?? [];
    out.push({
      kind: "address",
      title,
      sub,
      value: fill,
      fill,
      ...(typeof lat === "number" && typeof lng === "number"
        ? { lat, lng }
        : {}),
    });
  }

  return out;
}
