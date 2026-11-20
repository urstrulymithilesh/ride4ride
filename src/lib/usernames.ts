/**
 * Fun, website-assigned usernames — letters only (no underscore, no numbers).
 * Handles are 3–20 lowercase letters: adjective + noun, e.g. "swiftfox".
 * Uniqueness is enforced by the DB unique index; callers loop with
 * `is_username_available` and fall back to a trailing letter if needed.
 */

export const FUN_ADJECTIVES = [
  "swift",
  "bright",
  "cosmic",
  "happy",
  "brave",
  "clever",
  "sunny",
  "midnight",
  "velvet",
  "turbo",
  "peppy",
  "quirky",
  "zippy",
  "mellow",
  "fuzzy",
  "dapper",
  "jolly",
  "nimble",
  "radiant",
  "silly",
  "sleepy",
  "sparkly",
  "sturdy",
  "witty",
  "zesty",
  "breezy",
  "cheery",
  "crisp",
  "dreamy",
  "eager",
  "frisky",
  "gentle",
  "jazzy",
  "kindly",
  "lively",
  "lucky",
  "merry",
  "peachy",
  "plucky",
  "snappy",
] as const;

export const FUN_NOUNS = [
  "fox",
  "otter",
  "panda",
  "koala",
  "falcon",
  "beaver",
  "rabbit",
  "tiger",
  "wolf",
  "bear",
  "deer",
  "eagle",
  "finch",
  "gecko",
  "heron",
  "ibis",
  "jaguar",
  "kookaburra",
  "lemur",
  "moose",
  "newt",
  "owl",
  "puma",
  "quail",
  "raven",
  "seal",
  "toucan",
  "urchin",
  "viper",
  "whale",
  "yak",
  "zebra",
  "comet",
  "meadow",
  "river",
  "cloud",
  "maple",
  "willow",
  "birch",
  "clover",
] as const;

function randOf<T>(arr: readonly T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Build one candidate handle — letters only, CamelCase, 3–20 chars. */
export function buildFunUsername(rnd: () => number = Math.random): string {
  const adj = randOf(FUN_ADJECTIVES, rnd);
  const noun = randOf(FUN_NOUNS, rnd);
  const base = `${cap(adj)}${cap(noun)}`.replace(/[^A-Za-z]/g, "");
  return base.slice(0, 20);
}

/** Letter suffix for collisions: 1→a, 2→b, … 27→aa. Letters only. */
export function lettersFor(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(97 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || "a";
}
