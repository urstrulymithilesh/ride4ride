import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Recolor the free OpenFreeMap "bright" style into the feed's light palette.
 *
 * We keep the public style rather than shipping a hand-written one: no API
 * key, no watermark, and the data stays current. The feed only needs
 * wayfinding labels: roads, cities/states, transit stops, airports and
 * water names. Shops and gas stations stay hidden to avoid POI clutter and
 * the extra sprite work they cause.
 */
const BG = "#e8e4db";
const WATER = "#a6d3e0";
const PARK = "#bfdfb4";
const WOOD = "#b0d3a4";
const RESIDENTIAL = "#f0ece5";
const COMMERCIAL = "#e3dcef";
const INDUSTRIAL = "#e5e3e6";
const ROAD_MINOR = "#ffffff";
const ROAD_MAJOR = "#ffffff";
const ROAD_MOTORWAY = "#f2daa4";
const ROAD_CASING = "#d3cdc1";
const PATH = "#cfe0c6";
const TEXT = "#262420";
const ROAD_TEXT = "#4e4941";
const WATER_TEXT = "#2f6473";
const TRANSIT_TEXT = "#27577a";
const HALO = "#ffffff";

const FILL_COLORS: Record<string, string> = {
  water: WATER,
  "water-intermittent": WATER,
  park: PARK,
  "landcover-grass": PARK,
  "landcover-grass-park": PARK,
  "landcover-wood": WOOD,
  "landuse-residential": RESIDENTIAL,
  "landuse-suburb": RESIDENTIAL,
  "landuse-commercial": COMMERCIAL,
  "landuse-industrial": INDUSTRIAL,
  "landuse-school": "#e3ddf0",
  "landuse-hospital": "#e3ddf0",
  "landuse-cemetery": "#d2e2ce",
  "landuse-railway": "#e2ded7",
  "landcover-glacier": "#ffffff",
  "landcover-ice-shelf": "#ffffff",
  "aeroway-area": "#dad4ca",
  road_area_pier: "#e2ddd3",
  "highway-area": "#ebe7df",
  "landcover-sand": "#ecdfbf",
};

/**
 * Symbol layers we deliberately turn off. The remaining labels are
 * highway/street names, route shields, cities/towns/villages, states,
 * transit stops, airports and water names. Shops, gas stations and other
 * POI clutter stay hidden.
 */
function isHiddenLabel(id: string): boolean {
  return (
    (id.startsWith("poi") && id !== "poi_transit") ||
    id.startsWith("label_country") ||
    id.startsWith("road_oneway") ||
    id === "label_other"
  );
}

function setPaint(map: MapLibreMap, id: string, prop: string, value: unknown) {
  try {
    map.setPaintProperty(id, prop, value as never);
  } catch {
    // A layer may not carry this paint property in a future style version.
  }
}

function setLayout(map: MapLibreMap, id: string, prop: string, value: unknown) {
  try {
    map.setLayoutProperty(id, prop, value as never);
  } catch {
    // Same as above: style revisions can drop properties.
  }
}

/** Apply the feed palette. Safe to call more than once. */
export function applyMapTheme(map: MapLibreMap) {
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id;

    if (layer.type === "background") {
      setPaint(map, id, "background-color", BG);
      continue;
    }

    if (layer.type === "fill") {
      // No building footprints: houses and commercial blocks stay off so
      // the map reads as clean streets and blocks behind the pins.
      if (id === "building" || id === "building-top") {
        setLayout(map, id, "visibility", "none");
        continue;
      }
      const color =
        FILL_COLORS[id] ??
        (id.startsWith("water") ? WATER : id.startsWith("landcover") ? PARK : BG);
      setPaint(map, id, "fill-color", color);
      continue;
    }

    if (layer.type === "line") {
      let color = ROAD_MINOR;
      // Casing first: a motorway casing should stay neutral, not amber.
      if (id.includes("casing")) color = ROAD_CASING;
      else if (id.startsWith("waterway") || id === "ferry") color = WATER;
      else if (id.includes("motorway")) color = ROAD_MOTORWAY;
      else if (
        id.includes("primary") ||
        id.includes("trunk") ||
        id.includes("secondary") ||
        id.includes("tertiary")
      )
        color = ROAD_MAJOR;
      else if (id.includes("path")) color = PATH;
      else if (id.includes("railway")) color = "#c9c4bb";
      else if (id.includes("boundary")) color = "#c6c0b6";
      else if (id.startsWith("aeroway")) color = "#d5d0c7";
      setPaint(map, id, "line-color", color);
      continue;
    }

    if (layer.type !== "symbol") continue;

    if (isHiddenLabel(id)) {
      setLayout(map, id, "visibility", "none");
      continue;
    }

    // The stock shield icons already have the right contrast; leave them.
    if (id.startsWith("highway-shield") || id === "road_shield_us") continue;

    // The stock style waits until z15 for residential street names. The
    // feed starts at a neighborhood zoom, so bring those labels in a
    // little earlier while collision handling keeps them from piling up.
    if (id === "highway-name-minor") {
      map.setLayerZoomRange(id, 14, 24);
    }

    let color = TEXT;
    if (id.startsWith("highway-name")) color = ROAD_TEXT;
    else if (id.startsWith("water_name") || id.startsWith("waterway"))
      color = WATER_TEXT;
    else if (id === "poi_transit") color = TRANSIT_TEXT;

    setPaint(map, id, "text-color", color);
    setPaint(map, id, "text-halo-color", HALO);
    setPaint(map, id, "text-halo-width", 1.2);
  }
}
