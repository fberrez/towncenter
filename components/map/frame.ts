// the map frame, in its URL form. Read by both the server component and the
// client map, so it depends on neither `server-only` nor the DOM.

import { normalizeBbox } from "@/lib/geo";
import type { Bbox } from "@/lib/types";

// a VIEW, not a sector to survey: the MAX_ZONE_AREA_KM2 ceiling applies to
// hand-drawn sectors only.
export const DEFAULT_FRAME: Bbox = {
  minLat: 48.86,
  minLng: 2.215,
  maxLat: 48.9,
  maxLng: 2.36,
};

/** Five decimals, roughly one metre. */
const DECIMALS = 5;

export function frameToText(bbox: Bbox): string {
  const box = normalizeBbox(bbox);
  return [box.minLat, box.minLng, box.maxLat, box.maxLng]
    .map((value) => value.toFixed(DECIMALS))
    .join(",");
}

// returns null on any anomaly, never throws and never yields NaN: a URL edited
// by hand must fall back to the default view.
export function textToFrame(raw: string | null | undefined): Bbox | null {
  if (!raw) return null;

  const parts = raw.split(",");
  if (parts.length !== 4) return null;

  const numbers = parts.map((part) => Number(part.trim()));
  if (numbers.some((value) => !Number.isFinite(value))) return null;

  const [minLat, minLng, maxLat, maxLng] = numbers as [number, number, number, number];
  if (Math.abs(minLat) > 90 || Math.abs(maxLat) > 90) return null;
  if (Math.abs(minLng) > 180 || Math.abs(maxLng) > 180) return null;

  return normalizeBbox({ minLat, minLng, maxLat, maxLng });
}

/** equal to the precision the frames are written with. */
export function sameFrame(a: Bbox, b: Bbox): boolean {
  return frameToText(a) === frameToText(b);
}

export function frameContains(outer: Bbox, inner: Bbox): boolean {
  const outside = normalizeBbox(outer);
  const inside = normalizeBbox(inner);
  return (
    inside.minLat >= outside.minLat &&
    inside.maxLat <= outside.maxLat &&
    inside.minLng >= outside.minLng &&
    inside.maxLng <= outside.maxLng
  );
}

/** a closed GeoJSON ring, in `[lng, lat]` order. */
export function ringOf(bbox: Bbox): [number, number][] {
  const box = normalizeBbox(bbox);
  return [
    [box.minLng, box.minLat],
    [box.maxLng, box.minLat],
    [box.maxLng, box.maxLat],
    [box.minLng, box.maxLat],
    [box.minLng, box.minLat],
  ];
}
