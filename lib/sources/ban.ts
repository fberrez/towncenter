// Fallback geocoder: one written address to one point on the map. Free, public,
// no API key, and rate-limited to one call per second. Never fatal: an address
// that cannot be placed returns `null` and the caller carries on.

import type { LatLng } from "../types";

const GEOCODE_URL = "https://data.geopf.fr/geocodage/search/";

/** `x-ratelimit-limit-second: 1`, plus margin. */
export const BAN_MIN_INTERVAL_MS = 1_100;

const DEFAULT_TIMEOUT_MS = 6_000;

const DEFAULT_ATTEMPTS = 2;

// below this `properties.score` (0 to 1) the result is a guess, and a guessed
// pin on the map reads as a fact.
export const BAN_MIN_SCORE = 0.5;

export class BanError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "BanError";
  }
}

// only `housenumber` is an exact address; `municipality` is the town centre.
export type BanResultType =
  | "housenumber"
  | "street"
  | "locality"
  | "municipality";

export type BanMatch = {
  lat: number;
  lng: number;
  /** The address as the reference dataset writes it. Visible text. */
  label: string;
  /** 0 to 1. */
  score: number;
  type: BanResultType | string;
  postalCode: string | null;
  city: string | null;
};

type BanFeature = {
  geometry?: { coordinates?: unknown } | null;
  properties?: {
    label?: string | null;
    score?: number | null;
    type?: string | null;
    postcode?: string | null;
    city?: string | null;
  } | null;
};

let queueTail: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const wait = BAN_MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return task();
  });
  queueTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type GeocodeOptions = {
  /** Defaults to `BAN_MIN_SCORE`. */
  minScore?: number;
  postalCode?: string | null;
  timeoutMs?: number;
  attempts?: number;
};

// `null` covers three cases that call for the same handling: not found, too
// uncertain, service unreachable. `geocodeDetailed` keeps the nuance.
export async function geocode(
  address: string,
  options: GeocodeOptions = {},
): Promise<LatLng | null> {
  const match = await geocodeDetailed(address, options);
  return match ? { lat: match.lat, lng: match.lng } : null;
}

// a `type: "municipality"` at 0.9 clears the score threshold and is still not
// the shop, so the caller gets the type as well.
export async function geocodeDetailed(
  address: string,
  options: GeocodeOptions = {},
): Promise<BanMatch | null> {
  const query = address.trim();
  if (query === "") return null;

  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  let last: BanError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const match = await schedule(() => geocodeOnce(query, options));
      if (!match) return null;
      const minScore = options.minScore ?? BAN_MIN_SCORE;
      return match.score >= minScore ? match : null;
    } catch (error) {
      if (!(error instanceof BanError)) throw error;
      if (!error.retryable) {
        console.error("[ban] geocoding refused", error.message);
        return null;
      }
      last = error;
      if (attempt < attempts) await sleep(500 * attempt);
    }
  }

  // never fatal: a failed fallback leaves the address without a point.
  console.error("[ban] geocoding gave up", last?.message ?? "");
  return null;
}

async function geocodeOnce(
  query: string,
  options: GeocodeOptions,
): Promise<BanMatch | null> {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  if (options.postalCode) {
    url.searchParams.set("postcode", options.postalCode);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new BanError("The geocoder took too long to answer.", true);
    }
    throw new BanError("Could not reach the geocoder.", true);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // read the status BEFORE parsing: a 429 or a 502 returns a page, not JSON.
    const detail = await response.text().catch(() => "");
    console.error("[ban] geocoder refused", response.status, detail.slice(0, 300));

    if (response.status === 429) {
      throw new BanError("The geocoder is rate-limiting.", true);
    }
    throw new BanError(
      `The geocoder answered ${response.status}.`,
      response.status >= 500,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new BanError("Unreadable answer from the geocoder.", true);
  }

  const features = (payload as { features?: BanFeature[] }).features;
  // an unknown address returns a 200 with `features: []`, never an error.
  if (!Array.isArray(features) || features.length === 0) return null;

  return toMatch(features[0]);
}

function toMatch(feature: BanFeature | undefined): BanMatch | null {
  if (!feature) return null;

  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  // GeoJSON order is [LONGITUDE, LATITUDE], the opposite of SIRENE and of the
  // naming used everywhere else here.
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const properties = feature.properties ?? {};
  const score = typeof properties.score === "number" ? properties.score : 0;

  return {
    lat,
    lng,
    label: typeof properties.label === "string" ? properties.label : "",
    score,
    type: typeof properties.type === "string" ? properties.type : "",
    postalCode: typeof properties.postcode === "string" ? properties.postcode : null,
    city: typeof properties.city === "string" ? properties.city : null,
  };
}
