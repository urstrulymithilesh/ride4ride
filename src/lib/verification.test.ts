import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowedDomainsHint,
  getVerificationMode,
  schoolFromEmail,
} from "@/lib/verification";

describe("getVerificationMode", () => {
  const OLD = process.env.EDU_VERIFICATION_MODE;
  afterEach(() => {
    if (OLD === undefined) delete process.env.EDU_VERIFICATION_MODE;
    else process.env.EDU_VERIFICATION_MODE = OLD;
    vi.unstubAllEnvs();
  });

  it("badges only on explicit badge mode", () => {
    vi.stubEnv("EDU_VERIFICATION_MODE", "badge");
    expect(getVerificationMode()).toBe("badge");
  });

  it("restricts by default and on any other value", () => {
    vi.stubEnv("EDU_VERIFICATION_MODE", "restrict");
    expect(getVerificationMode()).toBe("restrict");
    vi.stubEnv("EDU_VERIFICATION_MODE", "anything-else");
    expect(getVerificationMode()).toBe("restrict");
    delete process.env.EDU_VERIFICATION_MODE;
    expect(getVerificationMode()).toBe("restrict");
  });
});

describe("schoolFromEmail", () => {
  it("lower-cases the domain", () => {
    expect(schoolFromEmail("Alex@BERKELEY.EDU")).toBe("berkeley.edu");
  });

  it("returns null without a domain", () => {
    expect(schoolFromEmail("nodomain")).toBeNull();
  });
});

describe("allowedDomainsHint", () => {
  const client = (suffixes: Array<{ suffix: string }> | null) =>
    ({
      from: () => ({
        select: async () => ({ data: suffixes }),
      }),
    }) as never;

  it("joins several domains in readable English", async () => {
    expect(
      await allowedDomainsHint(
        client([{ suffix: ".edu" }, { suffix: "gmail.com" }]),
      ),
    ).toBe(".edu or gmail.com");
  });

  it("falls back when the table is empty or errors", async () => {
    expect(await allowedDomainsHint(client([]))).toBe(
      "an allowed email provider",
    );
    expect(await allowedDomainsHint(client(null))).toBe(
      "an allowed email provider",
    );
  });
});
