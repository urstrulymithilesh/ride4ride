import { describe, expect, it } from "vitest";
import { querySignupCount } from "@/lib/signup-count-query";

/**
 * Counter contract tests. The `unstable_cache` wrapper cannot run under
 * vitest (Next's incremental cache is absent), so the assertion target is
 * querySignupCount — the wrapper is a thin caching shell around it. The
 * homepage hides the counter on null, so every failure shape must map
 * to null here.
 */
describe("querySignupCount", () => {
  const db = (result: { count: number | null; error: unknown }) =>
    ({
      from: () => ({
        select: async () => result,
      }),
    }) as never;

  it("returns the count", async () => {
    expect(await querySignupCount(db({ count: 7, error: null }))).toBe(7);
  });

  it("returns null on query error", async () => {
    expect(
      await querySignupCount(db({ count: null, error: { message: "down" } })),
    ).toBeNull();
  });

  it("returns null on null count", async () => {
    expect(
      await querySignupCount(db({ count: null, error: null })),
    ).toBeNull();
  });
});
