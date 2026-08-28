/**
 * Shared domain types for Ride4Ride.
 *
 * These are hand-written placeholders for scaffolding. Once the Supabase
 * schema exists, generate DB types with the Supabase CLI:
 *   supabase gen types typescript --project-id <id> > src/types/database.ts
 * and derive row types from there instead of duplicating fields here.
 */

export type VerificationStatus = "unverified" | "pending" | "verified";

/** Public-facing user profile, 1:1 with a Supabase auth user. */
export interface Profile {
  id: string;
  display_name: string;
  school: string | null;
  verification: VerificationStatus;
  is_admin: boolean;
  is_banned: boolean;
  created_at: string;
  updated_at: string;
}

export type ReportTargetType = "post" | "user";
export type ReportReason =
  | "spam"
  | "harassment"
  | "scam"
  | "safety"
  | "inappropriate"
  | "other";
export type ReportStatus = "open" | "reviewed" | "actioned" | "dismissed";

export interface Report {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_ride_id: string | null;
  target_user_id: string | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: string;
}

export type RideKind = "offer" | "get";

/** Coarse location used for Offer-a-Ride posts and for public filtering. */
export interface CityLocation {
  city: string;
  state: string;
  zip?: string;
}

/**
 * Precise endpoint used for Get-a-Ride posts. Full address is PRIVATE and
 * must never be sent to other users until both parties agree to proceed.
 */
export interface AddressLocation extends CityLocation {
  address: string; // private — server-only until a match is confirmed
  lat?: number;
  lng?: number;
}

export type RideStatus = "active" | "matched" | "expired" | "cancelled";
export type SortOrder = "newest" | "oldest";

export interface RideFilters {
  zip?: string;
  city?: string;
  state?: string;
  sort?: SortOrder;
}

// ---------------------------------------------------------------------
// DB row types — mirror migration 0002. These are hand-maintained until
// we generate them via `supabase gen types typescript`. IMPORTANT: the
// address/coordinate fields live on `RideLocation`, NOT `Ride`, matching
// the DB split that keeps them unreadable to non-authorized users.
// ---------------------------------------------------------------------

/** Public `rides` row — coarse locations only, safe to expose to anyone. */
export interface Ride {
  id: string;
  type: RideKind;
  owner_id: string;
  from_city: string;
  from_state: string;
  from_zip: string | null;
  to_city: string;
  to_state: string;
  to_zip: string | null;
  ride_date: string | null; // null => "current"/ASAP
  is_future: boolean;
  description: string | null;
  status: RideStatus;
  distance_meters: number | null; // 'get' rides only; safe to show
  expires_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * SENSITIVE `ride_locations` row. Only ever returned to the ride owner or a
 * counterparty with an agreed `ride_reveals` row (enforced by RLS). Never
 * send this to the public.
 */
export interface RideLocation {
  ride_id: string;
  owner_id: string;
  from_address: string;
  to_address: string;
  from_lat: number | null;
  from_lng: number | null;
  to_lat: number | null;
  to_lng: number | null;
  created_at: string;
}

/** `rides_with_location` view: a Ride with address fields that are null unless authorized. */
export type RideWithLocation = Ride &
  Partial<Omit<RideLocation, "ride_id" | "owner_id" | "created_at">>;

/** Consent ledger row. Addresses reveal only when `agreed` is true. */
export interface RideReveal {
  id: string;
  ride_id: string;
  owner_id: string;
  viewer_id: string;
  owner_agreed: boolean;
  viewer_agreed: boolean;
  agreed: boolean; // generated: owner_agreed && viewer_agreed
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  ride_id: string | null;
  participant_one: string;
  participant_two: string;
  created_at: string;
  auto_delete_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  image_url: string | null; // image only — no video/audio
  created_at: string;
  auto_delete_at: string;
}
