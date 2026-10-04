import { describe, expect, it } from "vitest";
import { validateWantedRoute } from "@/lib/validations/wanted-routes";

const base = {
  from_city: "Chicago",
  from_state: "IL",
  to_city: "Naperville",
  to_state: "IL",
  date_window_start: "2026-11-01",
  date_window_end: "2026-11-04",
  role_wanted: "get",
};

describe("validateWantedRoute", () => {
  it("accepts a minimal valid route", () => {
    const r = validateWantedRoute({ ...base });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.role_wanted).toBe("get");
    }
  });

  it("rejects an inverted date window", () => {
    const r = validateWantedRoute({
      ...base,
      date_window_start: "2026-11-04",
      date_window_end: "2026-11-01",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.date_window_end).toBeDefined();
  });

  it("rejects a window longer than a year", () => {
    const r = validateWantedRoute({
      ...base,
      date_window_start: "2026-01-01",
      date_window_end: "2027-06-01",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.date_window_end).toBeDefined();
  });

  it("requires both city/state pairs", () => {
    const r = validateWantedRoute({ ...base, from_city: "", to_state: "" });
    expect(r.ok).toBe(false);
  });

  it("defaults an unknown role to get", () => {
    const r = validateWantedRoute({ ...base, role_wanted: "whatever" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.role_wanted).toBe("get");
  });
});
