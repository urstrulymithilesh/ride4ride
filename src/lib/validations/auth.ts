/**
 * Lightweight, dependency-free validation for auth forms.
 * (Swap for zod later if schemas grow — kept minimal for Phase 1.)
 */

export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize a phone number to E.164 for Supabase Auth (which only
 * accepts E.164 for phone sign-up/sign-in).
 *
 * US-first: 10 digits (or 11 starting with 1) become +1...; anything
 * with an explicit leading + passes through after stripping formatting.
 * Returns null when the input cannot be a phone number.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/[a-zA-Z]/.test(trimmed)) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (hasPlus) {
    if (digits.length < 7 || digits.length > 15) return null;
    return `+${digits}`;
  }
  let national = digits;
  // Tolerate a leading US country code or trunk prefix.
  if (national.length === 11 && national.startsWith("1")) {
    national = national.slice(1);
  }
  if (national.length !== 10) return null;
  return `+1${national}`;
}

/**
 * Current version of the Terms. Bump this whenever the Terms change in a
 * way that should require re-acceptance; `profiles.tos_version` records
 * what each user actually agreed to, so `profiles_missing_tos()` can find
 * everyone still on an older one.
 */
export const TOS_VERSION = "2026-09-03";

export type Gender = "male" | "female";

export interface SignUpInput {
  phone: string;
  /** Null when skipped at sign-up (can be added later in settings). */
  email: string | null;
  password: string;
  displayName: string;
  gender: Gender;
  /**
   * Deliberately two separate consents, not one combined checkbox.
   * Bundling "I am 18+" with "I accept the Terms" makes each weaker: a
   * user can only be shown to have agreed to the pair, never to either
   * on its own. Unbundled consent is the more defensible pattern for an
   * age attestation specifically, and this is one-way once real accounts
   * exist. `profiles` already stores them as separate columns.
   */
  ageConfirmed18: boolean;
  tosAccepted: boolean;
  /** YYYY-MM-DD. Required at signup so every profile has an age. */
  dob: string;
}

export interface SignInInput {
  /** E.164 phone. Phone + password is the only sign-in method for now. */
  phone: string;
  password: string;
}

/** YYYY-MM-DD date of birth. Required, real, past, and 18+. One rule
 *  shared by signup and settings so the age gate can't drift. */
export function validateDateOfBirth(dob: string): string | null {
  const value = dob.trim();
  if (!value) return "Enter your date of birth.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "That date isn't valid.";
  const d = new Date(value + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "That date isn't valid.";
  const now = new Date();
  if (d > now) return "Date of birth can't be in the future.";
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  if (age < 18) return "You must be 18 or older.";
  return null;
}

export function validateSignUp(raw: {
  phone: string;
  email: string;
  password: string;
  displayName: string;
  gender: string;
  ageConfirmed18: boolean;
  tosAccepted: boolean;
  /** YYYY-MM-DD from the signup form. Stored on the profile at creation. */
  dob: string;
}): { ok: true; data: SignUpInput } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const phone = normalizePhone(raw.phone);
  if (!phone) fieldErrors.phone = "Enter a valid phone number.";
  // Email is skippable: empty means "later in settings". When given it
  // must be valid; the domain allowlist is enforced server-side.
  const emailRaw = raw.email.trim().toLowerCase();
  const email = emailRaw ? emailRaw : null;
  if (email && !EMAIL_RE.test(email))
    fieldErrors.email = "Enter a valid email address.";
  const displayName = raw.displayName.trim();
  const password = raw.password;
  if (displayName.length < 2)
    fieldErrors.displayName = "Display name must be at least 2 characters.";
  if (displayName.length > 50)
    fieldErrors.displayName = "Display name must be 50 characters or fewer.";
  const gender = raw.gender.trim().toLowerCase();
  if (gender !== "male" && gender !== "female")
    fieldErrors.gender = "Choose male or female.";
  const dobError = validateDateOfBirth(raw.dob);
  if (dobError) fieldErrors.dob = dobError;
  if (password.length < 8)
    fieldErrors.password = "Password must be at least 8 characters.";
  // Both blocking, not advisory, and checked separately so the user is
  // told which one they missed. Neither can be applied retroactively to a
  // ride that has already happened.
  if (!raw.ageConfirmed18)
    fieldErrors.ageConfirmed18 = "You must confirm you are 18 or older.";
  if (!raw.tosAccepted)
    fieldErrors.tosAccepted =
      "You must accept the terms and privacy policy to create an account.";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    data: {
      phone: phone as string,
      email,
      password,
      displayName,
      gender: gender as Gender,
      dob: raw.dob.trim(),
      ageConfirmed18: true,
      tosAccepted: true,
    },
  };
}

export function validateSignIn(raw: {
  identifier: string;
  password: string;
}): { ok: true; data: SignInInput } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const identifier = raw.identifier.trim();

  // Phone + password only, for now. No usernames anywhere.
  const phone = normalizePhone(identifier);
  if (!phone) {
    fieldErrors.identifier = identifier.includes("@")
      ? "Sign in with your phone number, not your email."
      : "Enter the phone number you signed up with.";
  }
  if (!raw.password) fieldErrors.password = "Enter your password.";

  if (Object.keys(fieldErrors).length > 0 || !phone)
    return { ok: false, fieldErrors };
  return { ok: true, data: { phone, password: raw.password } };
}

/**
 * HOOK for a later phase: .edu student verification.
 * Right now sign-up accepts any email and profiles default to 'unverified'.
 * When we add verification, gate/flag accounts using this helper.
 */
export function isEduEmail(email: string): boolean {
  return /\.edu$/i.test(email.trim().toLowerCase());
}

/**
 * Only allow internal, single-slash paths as post-auth redirect targets.
 * Prevents open-redirect via `?redirectTo=//evil.com`.
 */
export function sanitizeRedirect(
  path: string | null | undefined,
  fallback = "/",
): string {
  if (!path) return fallback;
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
