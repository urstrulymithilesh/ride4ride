import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * startConversation opener tests. Boundaries mocked: auth (signed-in
 * user), the Supabase client (ride type, RPC, message read/insert), and
 * next/navigation's redirect (which throws to unwind the action).
 * Asserted: opener copy per post type, empty-only send, and that a failed
 * opener never blocks opening the chat.
 */
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/auth", () => ({
  getUser: async () => ({ id: "user-1" }),
}));

const state = {
  rideType: "get" as "offer" | "get",
  existing: [] as Array<{ id: string }>,
  inserted: [] as Array<object>,
  failInsert: false,
  rpcError: false,
};

function messagesQuery() {
  return {
    select(_c: string) {
      return this;
    },
    eq(_c: string, _v: string) {
      return this;
    },
    limit(_n: number) {
      return Promise.resolve({ data: state.existing });
    },
    async insert(row: object) {
      state.inserted.push(row);
      if (state.failInsert) return { error: { message: "denied" } };
      return { error: null };
    },
  };
}

function ridesQuery() {
  return {
    select(_c: string) {
      return this;
    },
    eq(_c: string, _v: string) {
      return this;
    },
    async maybeSingle() {
      return { data: { type: state.rideType } };
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () =>
      state.rpcError
        ? { data: null, error: { message: "nope" } }
        : { data: "conv-1", error: null },
    from: (table: string) =>
      table === "rides" ? ridesQuery() : messagesQuery(),
  }),
}));

const { startConversation } = await import("@/app/messages/actions");

function form(): FormData {
  const fd = new FormData();
  fd.set("rideId", "ride-1");
  return fd;
}

async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  throw new Error("did not redirect");
}

beforeEach(() => {
  state.rideType = "get";
  state.existing = [];
  state.inserted = [];
  state.failInsert = false;
  state.rpcError = false;
});

describe("startConversation opener", () => {
  it("sends the driving offer copy on a rider post", async () => {
    state.rideType = "get";
    const to = await redirectOf(() => startConversation(form()));
    expect(to).toBe("/messages/conv-1");
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      conversation_id: "conv-1",
      sender_id: "user-1",
      body: expect.stringContaining("drive this route"),
    });
  });

  it("sends the seat request copy on a captain post", async () => {
    state.rideType = "offer";
    await redirectOf(() => startConversation(form()));
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      body: expect.stringContaining("love a seat"),
    });
  });

  it("sends nothing into a resumed conversation", async () => {
    state.existing = [{ id: "m1" }];
    const to = await redirectOf(() => startConversation(form()));
    expect(to).toBe("/messages/conv-1");
    expect(state.inserted).toHaveLength(0);
  });

  it("still opens the chat when the opener insert fails", async () => {
    state.failInsert = true;
    const to = await redirectOf(() => startConversation(form()));
    expect(to).toBe("/messages/conv-1");
  });
});
