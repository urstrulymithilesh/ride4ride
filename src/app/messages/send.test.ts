import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * sendMessage validation tests. The length bound, image-path scoping, and
 * signed-out handling are mocked at the auth/client boundaries; the
 * assertions pin the validation order (cheap checks before the DB round
 * trip) and the friendly error contract.
 */
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/auth", () => ({
  getUser: async () => state.user,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      insert: (row: object) => {
        state.inserted.push(row);
        return {
          select: () => ({
            single: async () =>
              state.failInsert
                ? { data: null, error: { message: "denied" } }
                : { data: { id: "m1", ...row }, error: null },
          }),
        };
      },
    }),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

const state: {
  user: { id: string } | null;
  inserted: Array<object>;
  failInsert: boolean;
} = { user: { id: "user-1" }, inserted: [], failInsert: false };

const { sendMessage } = await import("@/app/messages/actions");

const convo = "conv-1";

beforeEach(() => {
  state.user = { id: "user-1" };
  state.inserted = [];
  state.failInsert = false;
});

describe("sendMessage", () => {
  it("rejects signed-out senders without touching the DB", async () => {
    state.user = null;
    const r = await sendMessage({
      conversationId: convo,
      body: "hi",
      imagePath: null,
    });
    expect(r.error).toBeDefined();
    expect(state.inserted).toHaveLength(0);
  });

  it("rejects empty messages", async () => {
    const r = await sendMessage({
      conversationId: convo,
      body: "   ",
      imagePath: null,
    });
    expect(r.error).toBeDefined();
    expect(state.inserted).toHaveLength(0);
  });

  it("rejects over-long text", async () => {
    const r = await sendMessage({
      conversationId: convo,
      body: "x".repeat(2001),
      imagePath: null,
    });
    expect(r.error).toContain("2000 characters or fewer");
    expect(state.inserted).toHaveLength(0);
  });

  it("rejects image paths outside the conversation folder", async () => {
    const r = await sendMessage({
      conversationId: convo,
      body: "",
      imagePath: "other-convo/evil.mp4",
    });
    expect(r.error).toBeDefined();
    expect(state.inserted).toHaveLength(0);
  });

  it("sends text and returns the row", async () => {
    const r = await sendMessage({
      conversationId: convo,
      body: "hello",
      imagePath: null,
    });
    expect(r.error).toBeUndefined();
    expect(r.message).toMatchObject({ body: "hello" });
  });

  it("maps DB failure to the friendly error", async () => {
    state.failInsert = true;
    const r = await sendMessage({
      conversationId: convo,
      body: "hello",
      imagePath: null,
    });
    expect(r.error).toBe("couldn't send the message. please try again.");
  });
});
