// Geometry and name matching. PURE: no network, no API key. Nothing here is
// positional: GeoJSON and MapLibre work in `[lng, lat]` and SIRENE returns
// latitude/longitude as strings, so this file only takes named `{ lat, lng }`.

import type { Bbox, LatLng } from "@/lib/types";

export const DEGREE_KM = 111.194927; // one degree of latitude, WGS 84 mean

// a sector drawn right to left is a valid gesture; normalize before any
// comparison, or `minLat > maxLat` yields an empty area with nothing to signal it.
export function normalizeBbox(bbox: Bbox): Bbox {
  return {
    minLat: Math.min(bbox.minLat, bbox.maxLat),
    maxLat: Math.max(bbox.minLat, bbox.maxLat),
    minLng: Math.min(bbox.minLng, bbox.maxLng),
    maxLng: Math.max(bbox.minLng, bbox.maxLng),
  };
}

// approximate area in km2. The cosine matters: at the latitude of Paris a degree
// of longitude is 73 km, and dropping it overestimates the area by half.
export function areaKm2(bbox: Bbox): number {
  const box = normalizeBbox(bbox);
  const midLat = (box.minLat + box.maxLat) / 2;
  const heightKm = (box.maxLat - box.minLat) * DEGREE_KM;
  const widthKm =
    (box.maxLng - box.minLng) * DEGREE_KM * Math.cos((midLat * Math.PI) / 180);
  return Math.abs(heightKm * widthKm);
}

// ray casting, closure implicit. Needed on top of the box: SIRENE only knows
// circles around a point, so we query wide and reject what the outline excludes.
export function pointInPolygon(point: LatLng, polygon: readonly LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const straddles = a.lat > point.lat !== b.lat > point.lat;
    if (!straddles) continue;
    const crossingLng =
      ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (point.lng < crossingLng) inside = !inside;
  }
  return inside;
}

// street key: number, accents and articles stripped. `null` below six characters,
// since "rue" or "av" would match the whole neighbourhood.
export function streetKey(address: string | null | undefined): string | null {
  if (!address) return null;
  const clean = address
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\s*\d+\s*(bis|ter|quater)?\s*,?\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(de|du|des|la|le|les|l|d)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length >= 6 ? clean : null;
}

// the two word sets and the thresholds below were measured on real pairs from the
// segment: only change them with a new measurement in hand.

// legal forms and shell words: they identify no business.
const LEGAL_FORMS = new Set([
  "sarl",
  "sarlu",
  "sas",
  "sasu",
  "sa",
  "eurl",
  "ei",
  "eirl",
  "earl",
  "sci",
  "scic",
  "scm",
  "scop",
  "snc",
  "sc",
  "selarl",
  "gie",
  "sep",
  "ste",
  "societe",
  "sarl-u",
]);

// words too common in the segment to prove anything: two businesses sharing only
// "cafe" are not the same business.
const GENERIC_TOKENS = new Set([
  "le",
  "la",
  "les",
  "l",
  "de",
  "du",
  "des",
  "d",
  "et",
  "au",
  "aux",
  "a",
  "chez",
  "the",
  "and",
  "cafe",
  "coffee",
  "shop",
  "restaurant",
  "resto",
  "bar",
  "brasserie",
  "bistrot",
  "bistro",
  "boulangerie",
  "patisserie",
  "traiteur",
  "maison",
  "paris",
  "pizzeria",
  "pizza",
  "boucherie",
  "charcuterie",
  "fromagerie",
  "epicerie",
  "glacier",
  "snack",
  "comptoir",
  "cuisine",
  "food",
  "kitchen",
  "house",
]);

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function meaningfulTokens(normalized: string): string[] {
  return normalized
    .split(" ")
    .filter((token) => token !== "" && !LEGAL_FORMS.has(token));
}

// Dice coefficient on bigrams: robust to small spelling variations.
function diceBigrams(a: string, b: string): number {
  const bigrams = (value: string): string[] => {
    const compact = value.replace(/ /g, "");
    const out: string[] = [];
    for (let i = 0; i < compact.length - 1; i += 1) {
      out.push(compact.slice(i, i + 2));
    }
    return out;
  };

  const left = bigrams(a);
  const right = bigrams(b);
  if (left.length === 0 || right.length === 0) return a === b ? 1 : 0;

  const pool = new Map<string, number>();
  for (const gram of left) pool.set(gram, (pool.get(gram) ?? 0) + 1);

  let shared = 0;
  for (const gram of right) {
    const count = pool.get(gram) ?? 0;
    if (count > 0) {
      shared += 1;
      pool.set(gram, count - 1);
    }
  }

  return (2 * shared) / (left.length + right.length);
}

// Similarity of two business names, 0 to 1. Bigrams are compared on the
// DISTINCTIVE part only: on full names "BOULANGERIE DU MARCHE" scores 0.83
// against "Boulangerie du Marais" and two neighbouring bakeries become one.
export function nameSimilarity(a: string, b: string): number {
  const normalizedA = normalizeName(a);
  const normalizedB = normalizeName(b);
  if (normalizedA === "" || normalizedB === "") return 0;
  if (normalizedA === normalizedB) return 1;

  const tokensA = meaningfulTokens(normalizedA);
  const tokensB = meaningfulTokens(normalizedB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setB = new Set(tokensB);
  const shared = tokensA.filter((token) => setB.has(token));

  if (shared.length > 0) {
    // containment also counts what is NOT shared; bigrams would return 1.00 for
    // "Ramen Bar" against "Ramen Bistrot".
    const containment = shared.length / Math.min(tokensA.length, tokensB.length);
    const distinctive = shared.some(
      (token) => !GENERIC_TOKENS.has(token) && token.length >= 3,
    );
    return distinctive ? containment : containment * 0.5;
  }

  // no token in common: only bigrams separate unrelated names from names split
  // differently ("CROQMIDI" against "Croq Midi").
  const coreA = tokensA.filter((token) => !GENERIC_TOKENS.has(token)).join(" ");
  const coreB = tokensB.filter((token) => !GENERIC_TOKENS.has(token)).join(" ");
  if (coreA === "" || coreB === "") {
    // a name made only of common words ("Le Comptoir") has no distinctive part.
    return diceBigrams(normalizedA, normalizedB);
  }
  return diceBigrams(coreA, coreB);
}

// great-circle distance in metres. Haversine: enough at street scale.
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
