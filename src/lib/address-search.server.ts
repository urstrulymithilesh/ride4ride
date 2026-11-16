import "server-only";

import { addressOptionsFromMapbox, type MapboxAddressFeature } from "@/lib/address-options";
import type { PlaceOption } from "@/lib/place-option";

/**
 * Mapbox street-address search, SERVER-ONLY.
 *
 * The token is read here (never in a Client Component), and this module
 * is imported only by the /api/address route handler. The route returns
 * suggestions; the final address still goes through geocodeAddress()
 * when the form is submitted.
 */

const TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const ENDPOINT = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const MIN_QUERY = 3;
const TIMEOUT_MS = 4_000;

let warnedAboutToken = false;

export async function searchAddresses(query: string): Promise<PlaceOption[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) return [];

  if (!TOKEN) {
    if (!warnedAboutToken) {
      warnedAboutToken = true;
      console.error(
        "[address] MAPBOX_ACCESS_TOKEN is not set; address suggestions are disabled.",
      );
    }
    return [];
  }

  const url =
    `${ENDPOINT}/${encodeURIComponent(q)}.json` +
    `?access_token=${TOKEN}` +
    `&autocomplete=true&limit=10&country=us&types=address&language=en`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // Status only: never log the query (it may contain a home address)
      // and never log the URL (it contains the access token).
      console.error("[address] mapbox search failed with status", res.status);
      return [];
    }

    const data = (await res.json()) as {
      features?: MapboxAddressFeature[];
    };
    return addressOptionsFromMapbox(data.features ?? [], 10);
  } catch (err) {
    // The error message can contain request details; keep the log generic.
    console.error(
      "[address] mapbox search request failed",
      err instanceof Error ? err.name : "unknown error",
    );
    return [];
  }
}
