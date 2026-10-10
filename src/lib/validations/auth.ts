/**
 * Lightweight, dependency-free validation for auth forms.
 * (Swap for zod later if schemas grow — kept minimal for Phase 1.)
 */

export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Current version of the Terms. Bump this whenever the Terms change in a
 * way that should require re-acceptance; `profiles.tos_version` records
 * what each user actually agreed to, so `profiles_missing_tos()` can find
 * everyone still on an older one.
 */
export const TOS_VERSION = "2026-09-03";

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  username: string;
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
}

export interface SignInInput {
  email: string;
  password: string;
}

export const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;

/**
 * Handles that would collide with app routes or imply official status.
 * A claimed "admin" or "rides" could never be visited (static routes win),
 * so reject them at signup instead of minting dead pages. Keep in sync
 * with the guard in src/app/[username]/page.tsx.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin",
  "administrator",
  "about",
  "api",
  "auth",
  "help",
  "login",
  "logout",
  "messages",
  "mod",
  "moderator",
  "needride",
  "need-ride",
  "null",
  "official",
  "privacy",
  "profile",
  "rideavailable",
  "ride-available",
  "ride4ride",
  "rides",
  "root",
  "settings",
  "sign-in",
  "signin",
  "sign-up",
  "signup",
  "static",
  "support",
  "system",
  "team",
  "terms",
  "undefined",
]);

/** Single place for the handle rules (DB check + signup form share these). */
export function validateUsername(username: string): string | null {
  if (!username) return "choose a username.";
  if (username.length < 3 || username.length > 20)
    return "username must be 3–20 characters.";
  if (!USERNAME_RE.test(username))
    return "letters, numbers, and _ only, starting with a letter.";
  if (RESERVED_USERNAMES.has(username))
    return "that name is reserved. try another.";
  return null;
}

export function validateSignUp(raw: {
  email: string;
  password: string;
  displayName: string;
  username: string;
  ageConfirmed18: boolean;
  tosAccepted: boolean;
}): { ok: true; data: SignUpInput } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const email = raw.email.trim().toLowerCase();
  const displayName = raw.displayName.trim();
  const username = raw.username.trim().toLowerCase();
  const password = raw.password;

  if (!EMAIL_RE.test(email)) fieldErrors.email = "enter a valid email address.";
  if (displayName.length < 2)
    fieldErrors.displayName = "display name must be at least 2 characters.";
  if (displayName.length > 50)
    fieldErrors.displayName = "display name must be 50 characters or fewer.";
  const usernameError = validateUsername(username);
  if (usernameError) fieldErrors.username = usernameError;
  if (password.length < 8)
    fieldErrors.password = "password must be at least 8 characters.";
  // Both blocking, not advisory, and checked separately so the user is
  // told which one they missed. Neither can be applied retroactively to a
  // ride that has already happened.
  if (!raw.ageConfirmed18)
    fieldErrors.ageConfirmed18 = "you must confirm you are 18 or older.";
  if (!raw.tosAccepted)
    fieldErrors.tosAccepted =
      "you must accept the terms and privacy policy to create an account.";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    data: {
      email,
      password,
      displayName,
      username,
      ageConfirmed18: true,
      tosAccepted: true,
    },
  };
}

export function validateSignIn(raw: {
  email: string;
  password: string;
}): { ok: true; data: SignInInput } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const email = raw.email.trim().toLowerCase();

  if (!EMAIL_RE.test(email)) fieldErrors.email = "enter a valid email address.";
  if (!raw.password) fieldErrors.password = "enter your password.";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { email, password: raw.password } };
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
