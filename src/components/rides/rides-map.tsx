"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as MapLibre from "maplibre-gl";
import { haversineMiles } from "@/lib/geo";
import type { MapRide } from "@/lib/ride-map";
import { CAR_GLYPH_PATH } from "@/lib/marker-art";
import { RECENTER_EVENT } from "@/components/places/search-form";
import { PinSheet } from "@/components/rides/pin-sheet";
import { applyMapTheme } from "@/lib/map-theme";
import { useViewerLocation } from "@/components/location/location-context";

/**
 * Free vector style from OpenFreeMap. We recolor it in map-theme.ts so the
 * map reads as part of the black app without exposing a Mapbox token.
 */
const STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

/** Pinch/scroll limits. Defaults match the reference: zoomed out shows the
 *  surrounding towns, zoomed in reaches street level. The visual editor
 *  can override these live via --r4r-min-zoom / --r4r-max-zoom. Landing
 *  and recenter both frame the viewer at the current min zoom. */
const MIN_ZOOM = 10;
const MAX_ZOOM = 17;

/**
 * Editor inline override only (no stylesheet fallback). Per-tab zoom
 * props carry the defaults, so the shared CSS values must not win over
 * them — an explicit editor edit still does.
 */
function readZoomOverride(name: string): number | null {
  if (typeof document === "undefined") return null;
  const n = parseFloat(document.documentElement.style.getPropertyValue(name));
  return Number.isFinite(n) ? n : null;
}

export function RidesMap({
  rides,
  interactive = true,
  minZoom = MIN_ZOOM,
  maxZoom = MAX_ZOOM,
  landingZoom,
  cluster = false,
}: {
  rides: MapRide[];
  /** The map stays interactive (pan/zoom/pins) everywhere it renders;
   *  the cards scroll in normal flow above it. */
  interactive?: boolean;
  /** Per-tab zoom limits. An explicit visual-editor edit still wins. */
  minZoom?: number;
  maxZoom?: number;
  /** Landing zoom. Defaults to the min zoom when omitted. */
  landingZoom?: number;
  /** City clusters ("N rides" pill + car glyph) instead of per-ride pins.
   *  Offer-tab view; need-ride keeps individual pins. */
  cluster?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibre.Map | null>(null);
  // Marker constructor (captured at map creation — the module itself only
  // ever loads dynamically) and the live ride markers, keyed for updates.
  const markerCtor =
    useRef<
      (new (options?: MapLibre.MarkerOptions) => MapLibre.Marker) | null
    >(null);
  const markersRef = useRef(new Map<string, MapLibre.Marker>());
  // Viewer blue-dot marker, owned by the map instance (moved in place by
  // the follow effect below, never recreated on GPS fixes).
  const meRef = useRef<MapLibre.Marker | null>(null);
  // Zoom-key the live map was created with. A new key (tab switch) is the
  // only thing that recreates the map; GPS fixes must never tear it down.
  const createdKey = useRef<string | null>(null);
  // Bumps whenever a fresh map instance exists, so the marker sync below
  // runs after the async map creation — not just on data changes.
  const [mapEpoch, setMapEpoch] = useState(0);
  const { coords } = useViewerLocation();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Tapped pin: other pins hide while its sheet is up. The id mirrors
  // into a ref so the marker rebuild (data refreshes) can re-apply the
  // isolation without re-running the camera move.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  // The sheet renders only once the framing flight lands (moveend), so
  // it never pops over a still-traveling pin. A newer tap supersedes
  // via the run token; an interruption clears both (see clearSelection).
  const [framedId, setFramedId] = useState<string | null>(null);
  const frameRun = useRef(0);

  // Frame a tapped pin in ONE smooth flight: fly straight to the camera
  // whose screen projection puts the pin at center-x, y=128 under zoom
  // 15. Solved exactly in world space (screen = center + (world -
  // centerWorld) * worldSize) instead of centering first and panning
  // after, so there is no visible hop. A newer flyTo simply retargets
  // the in-flight one, so rapid re-taps stay smooth too.
  const framePin = useCallback((lat: number, lng: number, id: string) => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;
    const run = ++frameRun.current;
    const toWorld = (lngLat: { lng: number; lat: number }) => {
      const s = Math.sin((lngLat.lat * Math.PI) / 180);
      return {
        x: lngLat.lng / 360 + 0.5,
        y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI),
      };
    };
    const fromWorld = (x: number, y: number) => {
      const n = Math.PI * (1 - 2 * y);
      return {
        lng: (x - 0.5) * 360,
        lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
      };
    };
    const Z15 = 512 * Math.pow(2, 15);
    const viewCenter = { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    const target = { x: el.clientWidth / 2, y: 128 };
    const pin = toWorld({ lng, lat });
    // Bearing-aware: screen space is the world rotated by -bearing, so
    // the desired screen shift is rotated by +bearing before becoming a
    // world delta. (At bearing 0 this collapses to the plain version.)
    const theta = (map.getBearing() * Math.PI) / 180;
    const dx = target.x - viewCenter.x;
    const dy = target.y - viewCenter.y;
    const centerWorld = {
      x: pin.x - (dx * Math.cos(theta) - dy * Math.sin(theta)) / Z15,
      y: pin.y - (dx * Math.sin(theta) + dy * Math.cos(theta)) / Z15,
    };
    const center = fromWorld(centerWorld.x, centerWorld.y);
    map.once("moveend", () => {
      if (frameRun.current !== run) return;
      setFramedId(id);
    });
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) map.jumpTo({ center: [center.lng, center.lat], zoom: 15 });
    else map.flyTo({ center: [center.lng, center.lat], zoom: 15 });
  }, []);

  const selectPin = useCallback(
    (ride: MapRide) => {
      if (selectedRef.current === ride.id) {
        selectedRef.current = null;
        setSelectedId(null);
        setFramedId(null);
        return;
      }
      selectedRef.current = ride.id;
      setSelectedId(ride.id);
      setFramedId(null);
      framePin(ride.lat, ride.lng, ride.id);
    },
    [framePin],
  );

  const clearSelection = useCallback(() => {
    selectedRef.current = null;
    setSelectedId(null);
    setFramedId(null);
  }, []);

  // Map lifecycle: created once per zoom-key (per tab) and destroyed on
  // unmount or tab switch. Deliberately NOT keyed on `coords` — GPS fixes
  // arrive constantly and recreating the map per fix reloads tiles and
  // yanks the camera. Position updates move the dot in place (see the
  // follow effect below); data refreshes rebuild markers only.
  const coordsReady = !!coords;
  useEffect(() => {
    if (!coords || !containerRef.current) return;

    const key = JSON.stringify([
      interactive,
      minZoom,
      maxZoom,
      landingZoom,
      cluster,
    ]);
    // Steady state (GPS fix re-render): the live map stays.
    if (mapRef.current && createdKey.current === key) return;

    let disposed = false;
    let readyTimer = 0;
    let onResize: (() => void) | null = null;
    const el = containerRef.current;
    // Captured for the cleanup below (lint: refs drift by cleanup time).
    const liveMarkers = markersRef.current;
    createdKey.current = key;

    void (async () => {
      // Dynamic import keeps MapLibre out of the server render.
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed) return;

      const map = new maplibregl.Map({
        container: el,
        style: STYLE_URL,
        center: [coords.lng, coords.lat],
        zoom: readZoomOverride("--r4r-min-zoom") ?? minZoom,
        attributionControl: false,
        interactive,
        maxZoom: readZoomOverride("--r4r-max-zoom") ?? maxZoom,
        minZoom: readZoomOverride("--r4r-min-zoom") ?? minZoom,
        fadeDuration: 0,
      });
      mapRef.current = map;
      markerCtor.current = maplibregl.Marker;
      setMapEpoch((e) => e + 1);
      // Viewer dot, created with the map. The follow effect below moves
      // it on GPS fixes — this construction never runs per fix.
      const me = document.createElement("div");
      me.className = "r4r-me";
      me.setAttribute("aria-hidden", "true");
      meRef.current = new maplibregl.Marker({ element: me, anchor: "center" })
        .setLngLat([coords.lng, coords.lat])
        .addTo(map);
      // Dev visual editor drives the live limits through
      // --r4r-min-zoom / --r4r-max-zoom (see editor-utils applyEdits).
      (window as unknown as { __r4rMap?: MapLibre.Map }).__r4rMap = map;

      const applyTheme = () => applyMapTheme(map);
      map.on("style.load", applyTheme);
      if (map.isStyleLoaded()) applyTheme();
      // Transit stops use sprite icons, and the free style ships a few of
      // those names without artwork. Fill the gaps with a transparent pixel
      // so the stop labels still render instead of being skipped.
      map.on("styleimagemissing", (event) => {
        if (map.hasImage(event.id)) return;
        map.addImage(event.id, {
          width: 1,
          height: 1,
          data: new Uint8Array(4),
        });
      });
      map.on("load", () => {
        if (disposed) return;

        // Landing view: the tab's landing zoom — unless a feed
        // auto-refresh just stashed the live viewport on window, in which
        // case the refresh keeps the camera instead of yanking it home.
        // Stale stashes (>60s) and tab switches (stash cleared) fall
        // through to the landing view.
        const stash = ((): {
          center: [number, number];
          zoom: number;
          at: number;
        } | null => {
          try {
            const v = (
              window as unknown as {
                __r4rViewport?: {
                  center: [number, number];
                  zoom: number;
                  at: number;
                };
              }
            ).__r4rViewport;
            return v && Date.now() - v.at < 60000 ? v : null;
          } catch {
            return null;
          }
        })();
        map.jumpTo(
          stash ?? {
            center: [coords.lng, coords.lat],
            zoom:
              readZoomOverride("--r4r-min-zoom") ?? landingZoom ?? minZoom,
          },
        );

        window.clearTimeout(readyTimer);
        setReady(true);
        map.resize();
      });

      // Don't leave the feed stuck on "Loading map…" if the style or
      // network never completes.
      readyTimer = window.setTimeout(() => {
        if (!disposed && !map.loaded()) setFailed(true);
      }, 15000);

      onResize = () => map.resize();
      window.addEventListener("resize", onResize);
    })().catch(() => {
      if (!disposed) setFailed(true);
    });

    return () => {
      disposed = true;
      window.clearTimeout(readyTimer);
      if (onResize) window.removeEventListener("resize", onResize);
      setReady(false);
      setFailed(false);
      liveMarkers.clear();
      meRef.current = null;
      createdKey.current = null;
      const map = mapRef.current;
      map?.remove();
      mapRef.current = null;
      markerCtor.current = null;
      const w = window as unknown as { __r4rMap?: unknown };
      if (w.__r4rMap === map) delete w.__r4rMap;
    };
    // `coords` is intentionally NOT a dep (see the header comment): the
    // boolean flip is the only subscription. The live `coords` value is
    // read on creation only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordsReady, interactive, minZoom, maxZoom, landingZoom, cluster]);

  // Dot follow: GPS fixes move the existing marker in place. The map
  // instance, its tiles, and the user's camera are untouched — no reload,
  // no reframe. (Manual city picks never emit fixes, so the chosen
  // center stands.)
  useEffect(() => {
    const map = mapRef.current;
    const Ctor = markerCtor.current;
    if (!map || !Ctor || !coords) return;
    if (meRef.current) {
      meRef.current.setLngLat([coords.lng, coords.lat]);
      return;
    }
    const me = document.createElement("div");
    me.className = "r4r-me";
    me.setAttribute("aria-hidden", "true");
    meRef.current = new Ctor({ element: me, anchor: "center" })
      .setLngLat([coords.lng, coords.lat])
      .addTo(map);
  }, [coords, mapEpoch]);

  // Ride markers live-update without tearing the map down: on every
  // data refresh the markers rebuild in place, so tiles never reload and
  // the loading overlay (mount-only) never flashes. Tab switches still
  // remount via the init effect above and reframe to the landing view.
  useEffect(() => {
    const map = mapRef.current;
    const Ctor = markerCtor.current;
    if (!map || !Ctor || !coords) return;
    let cancelled = false;

    const clearRideMarkers = () => {
      for (const m of markersRef.current.values()) m.remove();
      markersRef.current.clear();
    };

    const syncClusterVisibility = () => {
      if (!cluster) return;
      const show = Math.round(map.getZoom()) >= 10;
      for (const [key, m] of markersRef.current) {
        if (key.startsWith("c:"))
          m.getElement().style.display = show ? "" : "none";
      }
      syncCollisions();
    };

    const syncCollisions = () => {
      if (!cluster) return;
      const vis = [...markersRef.current.entries()].filter(
        ([key, m]) =>
          key.startsWith("c:") && m.getElement().style.display !== "none",
      );
      const boxes = vis.map(([, m]) => m.getElement().getBoundingClientRect());
      const hit = new Set<number>();
      for (let i = 0; i < vis.length; i++) {
        for (let j = i + 1; j < vis.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (
            a.left < b.right &&
            b.left < a.right &&
            a.top < b.bottom &&
            b.top < a.bottom
          ) {
            hit.add(i);
            hit.add(j);
          }
        }
      }
      vis.forEach(([, m], i) => {
        const car = m
          .getElement()
          .querySelector(".r4r-pin-drop") as HTMLElement | null;
        if (car) car.style.display = hit.has(i) ? "none" : "";
      });
    };

    const addPinMarkers = () => {
      // Nearest pins paint last so they sit on top when points overlap.
      const ordered = [...rides]
        .map((ride) => ({
          ride,
          milesAway: haversineMiles(coords, {
            lat: ride.lat,
            lng: ride.lng,
          }),
        }))
        .sort((a, b) => a.milesAway - b.milesAway);
      const selected = selectedRef.current;
      const hidden = (id: string) =>
        selected && selected !== id ? "none" : "";
      const onTap = (ride: (typeof ordered)[number]["ride"]) => (e: Event) => {
        // Don't let this become a map-tap deselect below.
        e.stopPropagation();
        selectPin(ride);
      };
      const pillFor = (ride: (typeof ordered)[number]["ride"]) => {
        const pill = document.createElement("span");
        pill.className = "r4r-pin-label";
        // Distance reads bright; the timing half ("• Now") is dimmed.
        if (ride.miles && ride.miles.includes(" • ")) {
          const cut = ride.miles.indexOf(" • ");
          const distEl = document.createElement("span");
          distEl.textContent = ride.miles.slice(0, cut);
          const whenEl = document.createElement("span");
          whenEl.className = "r4r-pin-when";
          whenEl.textContent = ride.miles.slice(cut);
          pill.append(distEl, whenEl);
        } else {
          pill.textContent = ride.miles ?? "ride";
        }
        return pill;
      };
      // Two layers: every glyph first, every pill after. A pill can never
      // slide under a neighboring glyph — overlap resolves by layering,
      // never by hiding anything.
      for (const { ride } of ordered) {
        const markerEl = document.createElement("button");
        markerEl.type = "button";
        markerEl.tabIndex = -1;
        markerEl.setAttribute("aria-hidden", "true");
        markerEl.className =
          "r4r-pin-marker r4r-pin-static cursor-pointer border-0 bg-transparent p-0";
        markerEl.style.display = hidden(ride.id);
        const drop = document.createElement("span");
        drop.className = "r4r-pin-drop";
        drop.setAttribute("aria-hidden", "true");
        drop.innerHTML =
          '<svg width="16" height="21" viewBox="45 20 137 181" fill="none" aria-hidden="true"><path fill="#000000" fill-rule="evenodd" d="M72.08 196.42 C74.45 193.90 74.51 193.40 74.83 174.17 C75.11 157.14 74.92 154.07 73.45 151.30 C70.81 146.35 63.36 144.66 54.75 147.05 C48.56 148.77 48.00 150.94 48.00 173.37 L48.00 192.85L50.59 195.92 C53.09 198.90 53.44 199.00 61.41 199.00 C68.97 199.00 69.85 198.79 72.08 196.42 Z M105.46 198.38 C109.40 196.87 110.00 193.05 110.00 169.55 L110.00 147.00L118.43 147.00 L126.87 147.00L127.18 170.59 L127.50 194.18L130.31 196.59 C134.09 199.84 139.27 199.82 142.55 196.55 L145.00 194.09L145.03 136.80 L145.05 79.50L151.63 76.56 C164.19 70.95 174.39 57.64 178.48 41.54 C180.78 32.53 180.49 29.33 177.08 25.92 C171.50 20.35 163.86 23.34 162.50 31.64 C162.15 33.76 160.96 38.60 159.86 42.39 C158.20 48.10 156.97 50.16 152.60 54.53 C143.58 63.55 137.86 65.73 119.94 66.99 C104.13 68.10 99.67 69.17 88.50 74.54 C70.54 83.18 61.06 95.50 58.06 114.08 C56.43 124.24 60.53 130.14 68.07 128.48 C72.24 127.57 74.09 124.76 75.54 117.13 C77.04 109.25 79.02 104.80 82.86 100.66 C85.21 98.13 89.96 95.00 91.45 95.00 C91.75 95.00 92.00 117.02 92.00 143.92 L92.00 192.85L94.59 195.92 C97.18 199.01 101.36 199.95 105.46 198.38 Z M127.48 55.71 C142.74 47.07 136.06 22.94 118.43 23.02 C107.56 23.06 98.80 34.72 101.90 45.05 C105.26 56.26 117.50 61.37 127.48 55.71 Z"/></svg>';
        markerEl.append(drop);
        markerEl.addEventListener("click", onTap(ride));
        const marker = new Ctor({ element: markerEl, anchor: "bottom" })
          .setLngLat([ride.lng, ride.lat])
          .addTo(map);
        markersRef.current.set(`p:${ride.id}:drop`, marker);
      }
      for (const { ride } of ordered) {
        const markerEl = document.createElement("button");
        markerEl.type = "button";
        markerEl.className =
          "r4r-pin-marker r4r-pin-static cursor-pointer border-0 bg-transparent p-0";
        markerEl.setAttribute(
          "aria-label",
          `Ride details: ${ride.miles ?? "ride"} near ${ride.city}`,
        );
        markerEl.style.display = hidden(ride.id);
        markerEl.append(pillFor(ride));
        markerEl.addEventListener("click", onTap(ride));
        // Same point as the glyph, lifted one glyph-height + the 1px gap
        // so the pill sits exactly where the stacked layout put it.
        const marker = new Ctor({
          element: markerEl,
          anchor: "bottom",
          offset: [0, -22],
        })
          .setLngLat([ride.lng, ride.lat])
          .addTo(map);
        markersRef.current.set(`p:${ride.id}:pill`, marker);
      }
    };

    const addClusterMarkers = () => {
      // One marker per pickup city — grey count pill with the black car
      // glyph below it. Position is the map's own city-label anchor
      // (fallback: pin centroid); a fixed screen offset drops the marker
      // just below the text. Tapping recenters on the cluster.
      const groups = new Map<
        string,
        { city: string; lat: number; lng: number; n: number }
      >();
      for (const ride of rides) {
        const key = `${ride.city.trim().toLowerCase()}||${ride.state.trim().toLowerCase()}`;
        const g = groups.get(key);
        if (g) {
          g.lat += ride.lat;
          g.lng += ride.lng;
          g.n += 1;
        } else {
          groups.set(key, {
            city: ride.city,
            lat: ride.lat,
            lng: ride.lng,
            n: 1,
          });
        }
      }
      for (const [groupKey, g] of groups.entries()) {
        let lat = g.lat / g.n;
        let lng = g.lng / g.n;
        try {
          const feats = map.querySourceFeatures("openmaptiles", {
            sourceLayer: "place",
            filter: ["==", ["get", "name"], g.city],
          });
          const geom = feats[0]?.geometry;
          if (geom?.type === "Point") {
            lng = geom.coordinates[0] ?? lng;
            lat = geom.coordinates[1] ?? lat;
          }
        } catch {
          // Tiles not ready or no such label: keep the centroid.
        }
        const key = `c:${groupKey}`;
        const countLabel = g.n > 99 ? "99+" : `${g.n}`;
        const label = `${countLabel} ride${g.n === 1 ? "" : "s"} near ${g.city}`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "r4r-pin-marker";
        button.title = label;
        button.setAttribute("aria-label", label);
        const pill = document.createElement("span");
        pill.className = "r4r-cluster-label";
        pill.textContent = `${countLabel} ride${g.n === 1 ? "" : "s"}`;
        const car = document.createElement("span");
        car.className = "r4r-pin-drop";
        car.setAttribute("aria-hidden", "true");
        car.innerHTML = `<svg width="40" height="29" viewBox="113 26 593 424" fill="none" aria-hidden="true"><path d="${CAR_GLYPH_PATH}" fill="#000000" fill-rule="evenodd"/></svg>`;
        button.append(pill, car);
        button.addEventListener("click", () => {
          const reduced =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (reduced) map.jumpTo({ center: [lng, lat], zoom: map.getZoom() });
          else map.flyTo({ center: [lng, lat], zoom: map.getZoom() });
        });
        const marker = new Ctor({
          element: button,
          anchor: "bottom",
          // The stack hangs below the label: pill top clears the text.
          offset: [0, 52] as [number, number],
        })
          .setLngLat([lng, lat])
          .addTo(map);
        markersRef.current.set(key, marker);
      }
      syncClusterVisibility();
    };

    const build = () => {
      if (cancelled) return;
      clearRideMarkers();
      if (cluster) addClusterMarkers();
      else addPinMarkers();
      syncClusterVisibility();
    };

    // Cluster label anchors live in the tiles: wait for them on a fresh
    // map, build immediately once they are there.
    let offIdle: (() => void) | null = null;
    if (cluster && !map.isStyleLoaded()) {
      const onIdle = () => build();
      map.once("idle", onIdle);
      offIdle = () => map.off("idle", onIdle);
    } else {
      build();
    }
    const onZoom = () => {
      syncClusterVisibility();
      syncCollisions();
    };
    const onMoveEnd = () => syncCollisions();
    // A manual pan/zoom dismisses the sheet (the framed pin is gone, so
    // the card's anchor is too). Programmatic moves from framePin carry
    // no originalEvent and are ignored.
    const onMoveStart = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent && selectedRef.current) clearSelection();
    };
    // Tapping empty map dismisses the sheet (and brings the other pins
    // back). Marker taps stopPropagation above, so they never land here.
    // A programmatic camera move has no originalEvent — only real taps
    // clear. The selected pin's own re-tap toggles via selectPin.
    const onMapClick = (e: { originalEvent: unknown }) => {
      if (!e.originalEvent) return;
      const t = e.originalEvent as unknown as
        | { target?: unknown }
        | null
        | undefined;
      const target = t?.target;
      if (
        target instanceof HTMLElement &&
        target.closest(".r4r-pin-marker")
      ) {
        return;
      }
      if (selectedRef.current) clearSelection();
    };
    map.on("zoom", onZoom);
    map.on("moveend", onMoveEnd);
    map.on("movestart", onMoveStart);
    map.on("click", onMapClick);
    return () => {
      cancelled = true;
      if (offIdle) offIdle();
      map.off("zoom", onZoom);
      map.off("moveend", onMoveEnd);
      map.off("movestart", onMoveStart);
      map.off("click", onMapClick);
    };
  }, [mapEpoch, rides, cluster, coords, selectPin, clearSelection]);

  // Isolation toggle: while a sheet is up every other pin hides;
  // clearing the selection brings them back. (The rebuild path above
  // applies the same rule, so refreshes can't flash them back either.)
  useEffect(() => {
    for (const [key, m] of markersRef.current) {
      if (!key.startsWith("p:")) continue;
      m.getElement().style.display =
        !selectedId || key.startsWith(`p:${selectedId}:`) ? "" : "none";
    }
  }, [selectedId]);

  // Recenter drops the selection first: the sheet closes and the hidden
  // pins return, then the dock's own flyTo runs.
  useEffect(() => {
    const onRecenter = () => clearSelection();
    window.addEventListener(RECENTER_EVENT, onRecenter);
    return () => window.removeEventListener(RECENTER_EVENT, onRecenter);
  }, [clearSelection]);

  return (
    <div
      className={`fixed inset-y-0 inset-x-0 z-0 mx-auto w-full max-w-[480px] overflow-hidden bg-app ${
        interactive ? "" : "pointer-events-none"
      }`}
    >
      <div
        ref={containerRef}
        role="application"
        aria-label="Map of rides near you"
        className="r4r-map absolute inset-0 z-0"
      />
      {!ready && !failed ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-app/90 backdrop-blur-2xl">
          <p className="text-xs text-faint">Loading map…</p>
        </div>
      ) : null}
      {failed ? (
        <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-app/90 px-6 text-center backdrop-blur-2xl">
          <p className="text-xs text-faint">Couldn&apos;t load the map.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-xs font-medium text-primary"
          >
            Retry
          </button>
        </div>
      ) : null}
      {ready && framedId ? (
        <PinSheet
          key={framedId}
          id={framedId}
          onClose={clearSelection}
        />
      ) : null}
    </div>
  );
}
