"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";
import type * as MapLibre from "maplibre-gl";
import { haversineMiles } from "@/lib/geo";
import type { MapRide } from "@/lib/ride-map";
import { CAR_GLYPH_PATH } from "@/lib/marker-art";
import { CHIP_PANEL_EVENT } from "@/components/places/search-form";
import { applyMapTheme } from "@/lib/map-theme";
import { useViewerLocation } from "@/components/location/location-context";

/**
 * Free vector style from OpenFreeMap. We recolor it in map-theme.ts so the
 * map reads as part of the black app without exposing a Mapbox token.
 */
const STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

/** Pins within this radius set the initial viewport; farther rides stay
 *  on the map but off-screen until the viewer pans out. */
const FIT_RADIUS_MILES = 75;

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
  showControls = true,
  minZoom = MIN_ZOOM,
  maxZoom = MAX_ZOOM,
  landingZoom,
  cluster = false,
}: {
  rides: MapRide[];
  /** The map stays interactive (pan/zoom/pins) everywhere it renders;
   *  the cards scroll in normal flow above it. */
  interactive?: boolean;
  /** Count + recenter HUD. Hidden on card-first views. */
  showControls?: boolean;
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
  // Bumps whenever a fresh map instance exists, so the marker sync below
  // runs after the async map creation — not just on data changes.
  const [mapEpoch, setMapEpoch] = useState(0);
  const { coords } = useViewerLocation();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // A chip search panel covers the count pill's corner — hide it while
  // one is open (see CHIP_PANEL_EVENT in search-form).
  const [chipOpen, setChipOpen] = useState(false);
  useEffect(() => {
    const onChip = (e: Event) =>
      setChipOpen((e as CustomEvent<boolean>).detail === true);
    window.addEventListener(CHIP_PANEL_EVENT, onChip);
    return () => window.removeEventListener(CHIP_PANEL_EVENT, onChip);
  }, []);

  useEffect(() => {
    if (!coords || !containerRef.current) return;

    let disposed = false;
    let readyTimer = 0;
    let onResize: (() => void) | null = null;
    const el = containerRef.current;
    // Captured for the cleanup below (lint: refs drift by cleanup time).
    const liveMarkers = markersRef.current;

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

        // Viewer position: blue pulsing dot. Added after pins so it stays
        // on top of overlapping markers.
        const me = document.createElement("div");
        me.className = "r4r-me";
        me.setAttribute("aria-hidden", "true");
        new maplibregl.Marker({ element: me, anchor: "center" })
          .setLngLat([coords.lng, coords.lat])
          .addTo(map);

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

      // Don't leave the feed stuck on "loading map…" if the style or
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
      const map = mapRef.current;
      map?.remove();
      mapRef.current = null;
      markerCtor.current = null;
      const w = window as unknown as { __r4rMap?: unknown };
      if (w.__r4rMap === map) delete w.__r4rMap;
    };
  }, [coords, interactive, minZoom, maxZoom, landingZoom, cluster]);

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
      // Static display for now: no tap action until the pin sheet lands.
      const ordered = [...rides]
        .map((ride) => ({
          ride,
          milesAway: haversineMiles(coords, {
            lat: ride.lat,
            lng: ride.lng,
          }),
        }))
        .sort((a, b) => a.milesAway - b.milesAway);
      for (const { ride } of ordered) {
        const markerEl = document.createElement("div");
        markerEl.className = "r4r-pin-marker r4r-pin-static";
        markerEl.setAttribute("aria-hidden", "true");
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
        // Hailing-person glyph under the pill, marking the pickup point.
        const drop = document.createElement("span");
        drop.className = "r4r-pin-drop";
        drop.setAttribute("aria-hidden", "true");
        drop.innerHTML =
          '<svg width="16" height="21" viewBox="45 20 137 181" fill="none" aria-hidden="true"><path fill="#000000" fill-rule="evenodd" d="M72.08 196.42 C74.45 193.90 74.51 193.40 74.83 174.17 C75.11 157.14 74.92 154.07 73.45 151.30 C70.81 146.35 63.36 144.66 54.75 147.05 C48.56 148.77 48.00 150.94 48.00 173.37 L48.00 192.85L50.59 195.92 C53.09 198.90 53.44 199.00 61.41 199.00 C68.97 199.00 69.85 198.79 72.08 196.42 Z M105.46 198.38 C109.40 196.87 110.00 193.05 110.00 169.55 L110.00 147.00L118.43 147.00 L126.87 147.00L127.18 170.59 L127.50 194.18L130.31 196.59 C134.09 199.84 139.27 199.82 142.55 196.55 L145.00 194.09L145.03 136.80 L145.05 79.50L151.63 76.56 C164.19 70.95 174.39 57.64 178.48 41.54 C180.78 32.53 180.49 29.33 177.08 25.92 C171.50 20.35 163.86 23.34 162.50 31.64 C162.15 33.76 160.96 38.60 159.86 42.39 C158.20 48.10 156.97 50.16 152.60 54.53 C143.58 63.55 137.86 65.73 119.94 66.99 C104.13 68.10 99.67 69.17 88.50 74.54 C70.54 83.18 61.06 95.50 58.06 114.08 C56.43 124.24 60.53 130.14 68.07 128.48 C72.24 127.57 74.09 124.76 75.54 117.13 C77.04 109.25 79.02 104.80 82.86 100.66 C85.21 98.13 89.96 95.00 91.45 95.00 C91.75 95.00 92.00 117.02 92.00 143.92 L92.00 192.85L94.59 195.92 C97.18 199.01 101.36 199.95 105.46 198.38 Z M127.48 55.71 C142.74 47.07 136.06 22.94 118.43 23.02 C107.56 23.06 98.80 34.72 101.90 45.05 C105.26 56.26 117.50 61.37 127.48 55.71 Z"/></svg>';
        markerEl.append(pill, drop);
        const marker = new Ctor({ element: markerEl, anchor: "bottom" })
          .setLngLat([ride.lng, ride.lat])
          .addTo(map);
        markersRef.current.set(`p:${ride.id}`, marker);
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
        const label = `${g.n} ride${g.n === 1 ? "" : "s"} near ${g.city}`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "r4r-pin-marker";
        button.title = label;
        button.setAttribute("aria-label", label);
        const pill = document.createElement("span");
        pill.className = "r4r-cluster-label";
        pill.textContent = `${g.n} ride${g.n === 1 ? "" : "s"}`;
        const car = document.createElement("span");
        car.className = "r4r-pin-drop";
        car.setAttribute("aria-hidden", "true");
        car.innerHTML = `<svg width="40" height="29" viewBox="113 26 593 424" fill="none" aria-hidden="true"><path d="${CAR_GLYPH_PATH}" fill="#000000" fill-rule="evenodd"/></svg>`;
        button.append(pill, car);
        button.addEventListener("click", () => {
          map.flyTo({ center: [lng, lat], zoom: map.getZoom() });
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
    map.on("zoom", onZoom);
    map.on("moveend", onMoveEnd);
    return () => {
      cancelled = true;
      if (offIdle) offIdle();
      map.off("zoom", onZoom);
      map.off("moveend", onMoveEnd);
    };
  }, [mapEpoch, rides, cluster, coords]);

  const nearbyCount = coords
    ? rides.filter(
        (r) =>
          haversineMiles(coords, { lat: r.lat, lng: r.lng }) <= FIT_RADIUS_MILES,
      ).length
    : 0;

  // Nearby count only — no "N farther" tail.
  const countLabel =
    rides.length === 0
      ? "no rides yet"
      : `${nearbyCount} ${nearbyCount === 1 ? "ride" : "rides"} near you`;

  return (
    <div
      className={`fixed inset-y-0 inset-x-0 z-0 mx-auto w-full max-w-[480px] overflow-hidden bg-app ${
        interactive ? "" : "pointer-events-none"
      }`}
    >
      <div
        ref={containerRef}
        role="application"
        aria-label="map of rides near you"
        className="r4r-map absolute inset-0 z-0"
      />
      {!ready && !failed ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-app/90 backdrop-blur-2xl">
          <p className="text-xs text-faint">loading map…</p>
        </div>
      ) : null}
      {failed ? (
        <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-app/90 px-6 text-center backdrop-blur-2xl">
          <p className="text-xs text-faint">couldn&apos;t load the map.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-xs font-medium text-primary"
          >
            retry
          </button>
        </div>
      ) : null}
      {ready ? (
        <>
          {showControls && rides.length > 0 && !chipOpen ? (
            // Tucked under the filter chips, horizontally centered.
            <p className="pointer-events-none absolute left-1/2 top-[calc(3.5rem+env(safe-area-inset-top))] z-10 inline-flex h-[21px] max-w-[60%] -translate-x-1/2 items-center truncate rounded-full glass-dark px-[18px] text-center text-[11px] text-white/70">
              {countLabel}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
