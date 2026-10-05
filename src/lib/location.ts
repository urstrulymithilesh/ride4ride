export interface GeoLocation {
  city: string;
  region: string;
}

export function formatLocation(loc: GeoLocation): string {
  return loc.region ? `${loc.city}, ${loc.region}` : loc.city;
}
