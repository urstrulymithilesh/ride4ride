/**
 * Masked street name for public display: the street NAME without any house
 * number. Mapbox puts the number in `address` and the name in `text` for
 * `address`-type matches, but the leading-digit strip below is a second
 * barrier so a provider shape change can never promote a house number onto
 * the public `rides.from_street` / `to_street` columns. Non-address matches
 * (POI, neighborhood, place) yield null — no street to mask.
 *
 * Pure and free of `server-only` so it can be unit-tested; the privacy
 * invariant "no house number in a public column" deserves an assertion
 * that runs on every push, not just a code comment.
 */
export function maskedStreet(f: {
  text?: string;
  place_type?: string[];
}): string | null {
  if (!f.place_type?.includes("address")) return null;
  const name = (f.text ?? "").replace(/^\d+\s+/, "").trim();
  if (!name) return null;
  // A bare number with no street name is not publishable: it can only be
  // a house number that lost its street, never a real street name.
  if (/^\d+$/.test(name)) return null;
  return name.slice(0, 80);
}
