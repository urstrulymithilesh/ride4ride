import { beforeEach, describe, expect, it, vi } from "vitest";

/** isCurrentUserAdmin: signed-out reads false without touching the DB. */
vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({
  getUser: async () => state.user,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.profile }),
        }),
      }),
    }),
  }),
}));

const state: {
  user: { id: string } | null;
  profile: { is_admin: boolean } | null;
} = { user: null, profile: null };

const { isCurrentUserAdmin } = await import("@/lib/admin");

beforeEach(() => {
  state.user = null;
  state.profile = null;
});

describe("isCurrentUserAdmin", () => {
  it("is false when signed out", async () => {
    expect(await isCurrentUserAdmin()).toBe(false);
  });

  it("reflects the profile flag", async () => {
    state.user = { id: "u1" };
    state.profile = { is_admin: false };
    expect(await isCurrentUserAdmin()).toBe(false);
    state.profile = { is_admin: true };
    expect(await isCurrentUserAdmin()).toBe(true);
  });

  it("is false when the profile row is missing", async () => {
    state.user = { id: "u1" };
    state.profile = null;
    expect(await isCurrentUserAdmin()).toBe(false);
  });
});
