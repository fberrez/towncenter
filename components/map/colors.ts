// MapLibre cannot read CSS variables, so tokens are resolved with
// getComputedStyle. Each must be a literal hex or rgb(): an unregistered custom
// property returns oklch()/color-mix() verbatim and MapLibre drops the layer.

import type { Theme } from "@/components/ui";

// the nine tones are relative to each other: street lightest, ground darkest,
// buildings between, in both themes. changing one alone inverts the map.
export type BasemapPalette = {
  water: string;
  buildings: string;
  green: string;
  street: string;
  streetEdge: string;
  rail: string;
  boundary: string;
  label: string;
  labelHalo: string;
};

export type MapPalette = {
  theme: Theme;
  /** index 0 = rank I. all five are equal: rank is encoded by dot diameter. */
  ranks: [string, string, string, string, string];
  acc: string;
  /**
   * anything painted on the map takes `accentMark`, anything written takes
   * `acc`: a mark must sit in the OKLCH 0.48-0.67 band to read as a shape, and
   * the dark accent is at L 0.76.
   */
  accentMark: string;
  success: string;
  failure: string;
  text1: string;
  text2: string;
  text3: string;
  surface1: string;
  border1: string;
  border2: string;
  fond: string;
  map: BasemapPalette;
};

// must stay identical to the light theme of `globals.css`.
const FALLBACK_PALETTE: MapPalette = {
  theme: "light",
  ranks: ["#0055ba", "#0055ba", "#0055ba", "#0055ba", "#0055ba"],
  acc: "#0055ba",
  accentMark: "#0055ba",
  success: "#006e30",
  failure: "#b32228",
  text1: "#101316",
  text2: "#585b5f",
  text3: "#888b8e",
  surface1: "#f7f7f8",
  border1: "#d7d9dc",
  border2: "#b9bcc0",
  fond: "#edeff2",
  map: {
    water: "#dfe4ea",
    buildings: "#e4e6ea",
    green: "#e5e8e6",
    street: "#ffffff",
    streetEdge: "#dcdee2",
    rail: "#e2e4e8",
    boundary: "#c8cbd0",
    label: "#585b5f",
    labelHalo: "#edeff2",
  },
};

// one `getComputedStyle` call for all tokens: each one forces a style recalc.
export function readPalette(): MapPalette {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return FALLBACK_PALETTE;
  }

  const root = document.documentElement;
  const computed = window.getComputedStyle(root);
  const token = (name: string, fallbackValue: string): string => {
    const value = computed.getPropertyValue(name).trim();
    return value === "" ? fallbackValue : value;
  };

  const theme: Theme = root.dataset.theme === "dark" ? "dark" : "light";

  return {
    theme,
    ranks: [
      token("--rank-1", FALLBACK_PALETTE.ranks[0]),
      token("--rank-2", FALLBACK_PALETTE.ranks[1]),
      token("--rank-3", FALLBACK_PALETTE.ranks[2]),
      token("--rank-4", FALLBACK_PALETTE.ranks[3]),
      token("--rank-5", FALLBACK_PALETTE.ranks[4]),
    ],
    acc: token("--accent", FALLBACK_PALETTE.acc),
    accentMark: token("--accent-mark", FALLBACK_PALETTE.accentMark),
    success: token("--success", FALLBACK_PALETTE.success),
    failure: token("--failure", FALLBACK_PALETTE.failure),
    text1: token("--text-1", FALLBACK_PALETTE.text1),
    text2: token("--text-2", FALLBACK_PALETTE.text2),
    text3: token("--text-3", FALLBACK_PALETTE.text3),
    surface1: token("--surface-1", FALLBACK_PALETTE.surface1),
    border1: token("--border-1", FALLBACK_PALETTE.border1),
    border2: token("--border-2", FALLBACK_PALETTE.border2),
    fond: token("--bg", FALLBACK_PALETTE.fond),
    map: {
      water: token("--map-water", FALLBACK_PALETTE.map.water),
      buildings: token("--map-buildings", FALLBACK_PALETTE.map.buildings),
      green: token("--map-green", FALLBACK_PALETTE.map.green),
      street: token("--map-street", FALLBACK_PALETTE.map.street),
      streetEdge: token("--map-street-edge", FALLBACK_PALETTE.map.streetEdge),
      rail: token("--map-rail", FALLBACK_PALETTE.map.rail),
      boundary: token("--map-boundary", FALLBACK_PALETTE.map.boundary),
      label: token("--map-label", FALLBACK_PALETTE.map.label),
      labelHalo: token("--map-label-halo", FALLBACK_PALETTE.map.labelHalo),
    },
  };
}

const HIDDEN_FAMILIES = new Set(["aeroway", "aerodrome_label"]);

// layers are classified by `source-layer`, not by id: positron ids are not a
// contract. the map is typed structurally rather than as maplibre-gl's `Map` so
// this module does not pull the package into the resolution graph.
export function stripBasemap(
  map: {
    getStyle: () => { layers?: readonly { id: string; type: string }[] };
    getLayer: (id: string) => unknown;
    setPaintProperty: (id: string, property: string, value: unknown) => void;
    setLayoutProperty: (id: string, property: string, value: unknown) => void;
  },
  palette: MapPalette,
): void {
  const layers = map.getStyle().layers ?? [];
  const basemap = palette.map;

  for (const layer of layers) {
    // our own layers repaint themselves, with their data-driven expressions.
    if (layer.id.startsWith("sector") || layer.id.startsWith("targets")) continue;

    const family = (layer as { "source-layer"?: string })["source-layer"] ?? "";
    const hide = () => map.setLayoutProperty(layer.id, "visibility", "none");

    if (HIDDEN_FAMILIES.has(family)) {
      hide();
      continue;
    }

    // highway shields are US road icons, meaningless on a French street plan.
    if (layer.id.includes("shield")) {
      hide();
      continue;
    }

    switch (layer.type) {
      case "background":
        map.setPaintProperty(layer.id, "background-color", palette.fond);
        break;

      case "fill": {
        const tint =
          family === "water"
            ? basemap.water
            : family === "building"
              ? basemap.buildings
              : family === "park" || family === "landcover"
                ? basemap.green
                : family === "transportation"
                  ? basemap.street
                  : palette.fond;
        map.setPaintProperty(layer.id, "fill-color", tint);
        if (family === "building") {
          map.setPaintProperty(layer.id, "fill-outline-color", basemap.streetEdge);
        }
        break;
      }

      case "line": {
        // "casing" is matched on the id: the OpenMapTiles schema does not
        // separate a road outline from its fill.
        const tint =
          family === "water" || family === "waterway"
            ? basemap.water
            : family === "boundary"
              ? basemap.boundary
              : layer.id.includes("railway")
                ? basemap.rail
                : layer.id.includes("casing")
                  ? basemap.streetEdge
                  : basemap.street;
        map.setPaintProperty(layer.id, "line-color", tint);
        break;
      }

      case "symbol":
        map.setPaintProperty(layer.id, "text-color", basemap.label);
        map.setPaintProperty(layer.id, "text-halo-color", basemap.labelHalo);
        map.setPaintProperty(layer.id, "text-halo-width", 1.4);
        map.setPaintProperty(layer.id, "text-halo-blur", 0);
        break;

      default:
        break;
    }
  }
}

// the two images below are drawn on a canvas, not shipped as assets: their
// colour follows the theme and a PNG cannot be re-tinted.

const PATTERN_SIZE = 16;

export function hatchPattern(color: string): ImageData | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = PATTERN_SIZE;
  canvas.height = PATTERN_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, PATTERN_SIZE, PATTERN_SIZE);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "square";

  // the step must divide the tile size, or the hatch breaks across tiles.
  for (let start = -PATTERN_SIZE; start < PATTERN_SIZE * 2; start += 8) {
    ctx.beginPath();
    ctx.moveTo(start, 0);
    ctx.lineTo(start + PATTERN_SIZE, PATTERN_SIZE);
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, PATTERN_SIZE, PATTERN_SIZE);
}

export function vertexSquare(color: string, border: string): ImageData | null {
  if (typeof document === "undefined") return null;

  const side = 10;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, side, side);
  ctx.fillStyle = color;
  ctx.fillRect(1, 1, side - 2, side - 2);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(1.5, 1.5, side - 3, side - 3);

  return ctx.getImageData(0, 0, side, side);
}
