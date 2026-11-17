import { describe, expect, it } from "vitest";
import { buildMapRides, cityCenter } from "./ride-geo.server";
import { haversineMiles } from "./geo";
import {
  addDays,
  formatMonthDay,
  todayInZone,
  timezoneForState,
} from "./pickup-tz";

describe("cityCenter (vendored US cities)", () => {
  it("finds Chicago, IL", () => {
    const center = cityCenter("Chicago", "IL");
    expect(center).not.toBeNull();
    if (!center) return;
    expect(center.lat).toBeGreaterThan(41.5);
    expect(center.lat).toBeLessThan(42.2);
    expect(center.lng).toBeGreaterThan(-88.1);
    expect(center.lng).toBeLessThan(-87.2);
  });

  it("accepts lowercase state and the New York / New York City variant", () => {
    const center = cityCenter("New York", "ny");
    expect(center).not.toBeNull();
    if (!center) return;
    expect(center.lat).toBeGreaterThan(40.4);
    expect(center.lat).toBeLessThan(41.1);
  });

  it("falls back to the state center for an unknown city", () => {
    const center = cityCenter("Not A Real City", "IL");
    expect(center).not.toBeNull();
    if (!center) return;
    // Inside Illinois' rough bounding box, not the null island.
    expect(center.lat).toBeGreaterThan(36.9);
    expect(center.lat).toBeLessThan(42.6);
    expect(center.lng).toBeGreaterThan(-91.6);
    expect(center.lng).toBeLessThan(-87.4);
  });

  it("returns null when the state is missing", () => {
    expect(cityCenter("Chicago", "")).toBeNull();
  });
});

describe("buildMapRides", () => {
  const chicago = { from_city: "Chicago", from_state: "IL" };

  it("labels the trip distance and keeps the pin near the city center", () => {
    const rows = [
      {
        id: "ride-1",
        ...chicago,
        to_city: "Naperville",
        to_state: "IL",
        distance_meters: 13_197, // 8.2 miles
      },
    ];
    const pins = buildMapRides(rows);
    expect(pins).toHaveLength(1);
    expect(pins[0].miles).toBe("8.2 miles");

    const center = cityCenter("Chicago", "IL");
    expect(center).not.toBeNull();
    if (!center) return;
    expect(haversineMiles(center, pins[0])).toBeLessThanOrEqual(1.6);
  });

  it("keeps one decimal for multi-digit distances", () => {
    const pins = buildMapRides([
      {
        id: "ride-1b",
        ...chicago,
        to_city: "Naperville",
        to_state: "IL",
        distance_meters: 25_427, // 15.8 miles
      },
    ]);
    expect(pins[0].miles).toBe("15.8 miles");
  });

  it("falls back to city-to-city distance when distance_meters is null", () => {
    const pins = buildMapRides([
      {
        id: "ride-2",
        ...chicago,
        to_city: "Naperville",
        to_state: "IL",
        distance_meters: null,
      },
    ]);
    expect(pins).toHaveLength(1);
    expect(pins[0].miles).toMatch(/miles?$/);
  });

  it("drops rows that cannot be resolved to a city", () => {
    expect(
      buildMapRides([
        {
          id: "ride-3",
          from_city: "",
          from_state: "",
          to_city: "",
          to_state: "",
          distance_meters: null,
        },
      ]),
    ).toHaveLength(0);
  });

  it("puts the same ride at the same approximate point", () => {
    const row = {
      id: "ride-4",
      ...chicago,
      to_city: "Naperville",
      to_state: "IL",
      distance_meters: 13_197,
    };
    expect(buildMapRides([row])).toEqual(buildMapRides([row]));
  });

  it("prefers the stored near-pickup pin over the city-center pin", () => {
    const row = {
      id: "ride-5",
      ...chicago,
      to_city: "Naperville",
      to_state: "IL",
      distance_meters: 13_197,
      pin_lat: 41.75,
      pin_lng: -88.31,
    };
    const pins = buildMapRides([row]);
    expect(pins).toHaveLength(1);
    expect(pins[0].lat).toBe(41.75);
    expect(pins[0].lng).toBe(-88.31);
    expect(pins[0].miles).toBe("8.2 miles");
  });

  it("falls back to the city-center pin when no stored pin exists", () => {
    const row = {
      id: "ride-6",
      ...chicago,
      to_city: "Naperville",
      to_state: "IL",
      distance_meters: 13_197,
      pin_lat: null,
      pin_lng: null,
    };
    const pins = buildMapRides([row]);
    expect(pins).toHaveLength(1);
    expect(pins[0].miles).toBe("8.2 miles");
    const center = cityCenter("Chicago", "IL");
    expect(center).not.toBeNull();
    if (!center) return;
    expect(haversineMiles(center, pins[0])).toBeLessThanOrEqual(1.6);
  });

  it("appends Now for asap rides", () => {
    const pins = buildMapRides([
      {
        id: "ride-7",
        ...chicago,
        to_city: "Naperville",
        to_state: "IL",
        distance_meters: 13_197,
        time_mode: "asap",
        ride_time: null,
      },
    ]);
    expect(pins[0].miles).toBe("8.2 miles • Now");
  });

  it("appends Anytime for anytime rides", () => {
    const pins = buildMapRides([
      {
        id: "ride-8",
        ...chicago,
        to_city: "Naperville",
        to_state: "IL",
        distance_meters: 13_197,
        time_mode: "anytime",
        ride_time: null,
      },
    ]);
    expect(pins[0].miles).toBe("8.2 miles • Anytime");
  });

  it("appends the dotted clock for at-time rides", () => {
    const pins = buildMapRides([
      {
        id: "ride-9",
        ...chicago,
        to_city: "Naperville",
        to_state: "IL",
        distance_meters: 13_197,
        time_mode: "at",
        ride_time: "10:45",
      },
    ]);
    expect(pins[0].miles).toBe("8.2 miles • 10.45 am");
  });

  it("leaves the label as distance alone when timing is missing", () => {
    const pins = buildMapRides([
      {
        id: "ride-10",
        ...chicago,
        to_city: "Naperville",
        to_state: "IL",
        distance_meters: 13_197,
      },
    ]);
    expect(pins[0].miles).toBe("8.2 miles");
  });

  it("shows Tomorrow for tomorrow rides without the time", () => {
    const today = todayInZone(timezoneForState("IL"));
    const pins = buildMapRides([
      {
        id: "ride-11",
        ...chicago,
        to_city: "Naperville",
        to_state: "IL",
        distance_meters: 13_197,
        time_mode: "at",
        ride_time: "17:00",
        ride_date: addDays(today, 1),
      },
    ]);
    expect(pins[0].miles).toBe("8.2 miles • Tomorrow");
  });

  it("shows Mon DD for later rides without the time", () => {
    const today = todayInZone(timezoneForState("IL"));
    const later = addDays(today, 5);
    const pins = buildMapRides([
      {
        id: "ride-12",
        ...chicago,
        to_city: "Naperville",
        to_state: "IL",
        distance_meters: 13_197,
        time_mode: "anytime",
        ride_time: null,
        ride_date: later,
      },
    ]);
    expect(pins[0].miles).toBe(`8.2 miles • ${formatMonthDay(later)}`);
  });

  it("shows the time again once the ride day arrives", () => {
    const today = todayInZone(timezoneForState("IL"));
    const pins = buildMapRides([
      {
        id: "ride-13",
        ...chicago,
        to_city: "Naperville",
        to_state: "IL",
        distance_meters: 13_197,
        time_mode: "at",
        ride_time: "17:00",
        ride_date: today,
      },
    ]);
    expect(pins[0].miles).toBe("8.2 miles • 5.00 pm");
  });
});
