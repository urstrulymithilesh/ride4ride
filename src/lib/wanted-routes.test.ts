import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Claim-flow tests. The module under test is server-only and talks to
 * cookies + the service-role client, so all three boundaries are mocked:
 * `server-only` (import guard), `next/headers` (cookie jar), and the admin
 * client (query builder). What remains is exactly the logic that matters:
 * id parsing/bounding, the unowned-only claim filter, and the
 * never-block-auth failure posture.
 */
vi.mock("server-only", () => ({}));

const jar = {
  store: new Map<string, string>(),
  get(name: string) {
    const v = this.store.get(name);
    return v === undefined ? undefined : { value: v };
  },
  set(name: string, value: string) {
    this.store.set(name, value);
  },
  delete(name: string) {
    this.store.delete(name);
  },
};

vi.mock("next/headers", () => ({ cookies: async () => jar }));

type Row = { id: string; created_by: string | null };

const db = {
  rows: [] as Row[],
  lastUpdate: null as null | { values: object; ids: string[] },
  failNext: false,
};

function builder() {
  const state: { values?: object; ids?: string[] } = {};
  return {
    update(values: object) {
      state.values = values;
      return this;
    },
    in(_col: string, ids: string[]) {
      state.ids = ids;
      return this;
    },
    is(_col: string, _v: null) {
      return this;
    },
    async select(_cols: string) {
      db.lastUpdate = {
        values: state.values ?? {},
        ids: state.ids ?? [],
      };
      if (db.failNext) {
        db.failNext = false;
        return { data: null, error: { message: "boom", code: "XX000" } };
      }
      const claimed = db.rows.filter(
        (r) => (state.ids ?? []).includes(r.id) && r.created_by === null,
      );
      return { data: claimed.map((r) => ({ id: r.id })), error: null };
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (_t: string) => builder() }),
}));

const {
  rememberWantedRoute,
  claimWantedRoutes,
} = await import("@/lib/wanted-routes");

const ID_A = "11111111-1111-1111-1111-111111111111";
const ID_B = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  jar.store.clear();
  db.rows = [];
  db.lastUpdate = null;
});

describe("rememberWantedRoute", () => {
  it("ignores non-UUID input", async () => {
    await rememberWantedRoute("not-a-uuid");
    expect(jar.store.has("r4r_wanted")).toBe(false);
  });

  it("stores the id and dedupes repeats", async () => {
    await rememberWantedRoute(ID_A);
    await rememberWantedRoute(ID_A);
    expect(jar.store.get("r4r_wanted")?.split(",")).toEqual([ID_A]);
  });

  it("drops non-UUID entries already in the cookie", async () => {
    jar.store.set("r4r_wanted", `junk,${ID_A},,,,${ID_B}`);
    await rememberWantedRoute(ID_A);
    expect(jar.store.get("r4r_wanted")).toBe(`${ID_A},${ID_B}`);
  });

  it("caps the list at 10 ids", async () => {
    const ids = Array.from(
      { length: 12 },
      (_, i) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    for (const id of ids) await rememberWantedRoute(id);
    expect(jar.store.get("r4r_wanted")?.split(",")).toHaveLength(10);
  });
});

describe("claimWantedRoutes", () => {
  it("returns 0 with no cookie and touches nothing", async () => {
    expect(await claimWantedRoutes("user-1")).toBe(0);
    expect(db.lastUpdate).toBeNull();
  });

  it("claims only unowned rows and clears the cookie", async () => {
    db.rows = [
      { id: ID_A, created_by: null },
      { id: ID_B, created_by: "someone-else" },
    ];
    jar.store.set("r4r_wanted", `${ID_A},${ID_B}`);
    expect(await claimWantedRoutes("user-1")).toBe(1);
    // The unowned-only filter is what makes a stale cookie unable to
    // reassign someone else's row.
    expect(db.lastUpdate?.values).toEqual({ created_by: "user-1" });
    expect(jar.store.has("r4r_wanted")).toBe(false);
  });

  it("keeps the cookie for retry when the update fails", async () => {
    db.rows = [{ id: ID_A, created_by: null }];
    db.failNext = true;
    jar.store.set("r4r_wanted", ID_A);
    expect(await claimWantedRoutes("user-1")).toBe(0);
    expect(jar.store.get("r4r_wanted")).toBe(ID_A);
  });
});
