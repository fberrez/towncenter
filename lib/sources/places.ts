// Google Places API (New): what Google knows about an already harvested
// address. Server-only, and `GOOGLE_PLACES_API_KEY` is read AT CALL TIME: a
// value read on module load freezes at build.
// Matching stays cautious (normalized name AND under 80 metres) because
// attaching a neighbour's website to a business is worse than knowing nothing.

import { distanceMeters, nameSimilarity } from "@/lib/geo";
import {
  GOOGLE_FRESHNESS_DAYS,
  type GooglePlaceFacts,
  type GooglePlaceMatch,
} from "@/lib/types";

const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

// the FieldMask is MANDATORY - omitting it is a 400 - and it decides the billed
// SKU. The `places.` prefix belongs to `searchText`; Place Details refuses it.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.businessStatus",
  "places.regularOpeningHours",
  "places.types",
].join(",");

// wider than the match threshold on purpose: `locationBias` biases ranking, it
// does not filter, so the match decision is made below and not by Google.
const SEARCH_RADIUS_METERS = 200;

// past this it is not the same address. SIRENE geocodes to the parcel and
// Google to the building, so tens of metres of drift are normal.
const MAX_MATCH_DISTANCE_METERS = 80;

// at 0.70, "CHEZ MARCEL" matched "Chez Marceau"; legitimate matches score 1.00
// through token inclusion, so a high threshold costs nothing.
const MIN_NAME_SCORE = 0.78;

const MIN_CONFIDENCE = 0.62;

export class PlacesError extends Error {
  constructor(
    message: string,
    /** `PERMISSION_DENIED` and `INVALID_ARGUMENT` never heal on their own. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlacesError";
  }
}

// read AT CALL TIME: a value read on module load freezes at build.
export function envPlacesKey(): string | null {
  const raw = process.env.GOOGLE_PLACES_API_KEY?.trim() ?? "";
  return raw === "" ? null : raw;
}

// `websiteUri` from Places is the product's only source of website addresses,
// so both enrichment actions refuse to run without a key. Harvest, directors,
// geocoding, map and scoring do not need one.
export function isPlacesConfigured(): boolean {
  return envPlacesKey() !== null;
}

export function googleDataAgeDays(
  fetchedAt: string | Date | null | undefined,
): number | null {
  if (!fetchedAt) return null;
  const date = fetchedAt instanceof Date ? fetchedAt : new Date(fetchedAt);
  const time = date.getTime();
  if (!Number.isFinite(time)) return null;
  return (Date.now() - time) / 86_400_000;
}

// Google's terms allow storing only `place_id` durably: rating, review count,
// price level, hours, phone and coordinates expire after 30 calendar days
// (Service Specific Terms 3.2.3) and are then hidden and purged. Never raise
// the threshold. A missing or unreadable timestamp counts as stale.
export function isGoogleDataStale(
  fetchedAt: string | Date | null | undefined,
): boolean {
  const age = googleDataAgeDays(fetchedAt);
  if (age === null) return true;
  return age > GOOGLE_FRESHNESS_DAYS;
}

/** A full `SireneEstablishment` is assignable as is. */
export type PlaceLookupInput = {
  name: string;
  lat: number;
  lng: number;
  legalName?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
};

export type PlaceLookupOptions = {
  timeoutMs?: number;
  attempts?: number;
  /** Lowering this threshold means accepting the neighbour. */
  minConfidence?: number;
  /** The caller's key; the environment's when absent. */
  key?: string | null;
};

// implemented in `@/lib/geo`, which must stay importable without this client.
export { distanceMeters, nameSimilarity };

// the New API returns a STRING here where the old one returned 0-4, so an old
// parser cannot be reused. `FREE` and `UNSPECIFIED` become null.
function toPriceLevel(value: string | undefined): number | null {
  switch (value) {
    case "PRICE_LEVEL_INEXPENSIVE":
      return 1;
    case "PRICE_LEVEL_MODERATE":
      return 2;
    case "PRICE_LEVEL_EXPENSIVE":
      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return 4;
    default:
      return null;
  }
}

/** 4.6 becomes 46: ratings are integer tenths, never floats. */
function toRatingTenths(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const tenths = Math.round(value * 10);
  if (tenths < 0 || tenths > 50) return null;
  return tenths;
}

function toCount(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const count = Math.trunc(value);
  return count < 0 ? null : count;
}

function nonEmpty(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

type SearchTextPlace = {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  businessStatus?: string;
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
    periods?: unknown[];
  };
  types?: string[];
};

type SearchTextResponse = { places?: SearchTextPlace[] };

// the address must be in the text: without it a common name returns the most
// popular place in town, and location bias does not fix that.
function textQueryFor(input: PlaceLookupInput): string {
  return [input.name, input.address, input.postalCode, input.city]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part !== "")
    .join(" ");
}

// returns null - not a failure - when the key is missing, when Google knows
// nothing, or when no candidate clears the threshold. Real failures throw.
export async function findPlaceFor(
  input: PlaceLookupInput,
  options: PlaceLookupOptions = {},
): Promise<GooglePlaceMatch | null> {
  const key = options.key ?? envPlacesKey();
  if (!key) return null;
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return null;

  const query = textQueryFor(input);
  if (query === "") return null;

  const attempts = Math.max(1, options.attempts ?? 3);
  let last: PlacesError | null = null;
  let payload: SearchTextResponse | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      payload = await searchTextOnce(query, input, options.timeoutMs, key);
      break;
    } catch (error) {
      if (!(error instanceof PlacesError) || !error.retryable) throw error;
      last = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }

  if (!payload) {
    throw last ?? new PlacesError("Google did not answer.", true);
  }

  return pickBestMatch(payload.places ?? [], input, options.minConfidence);
}

// exported so it can be exercised without an API key.
export function pickBestMatch(
  places: SearchTextPlace[],
  input: PlaceLookupInput,
  minConfidence: number = MIN_CONFIDENCE,
): GooglePlaceMatch | null {
  let best: GooglePlaceMatch | null = null;

  for (const place of places) {
    const id = nonEmpty(place.id);
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (!id || typeof lat !== "number" || typeof lng !== "number") continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const meters = distanceMeters(input, { lat, lng });
    if (meters > MAX_MATCH_DISTANCE_METERS) continue;

    const candidateName = nonEmpty(place.displayName?.text) ?? "";
    // the legal name is a second try: "SARL DUPONT" on the register,
    // "Boulangerie Dupont" on the shopfront.
    const nameScore = Math.max(
      nameSimilarity(input.name, candidateName),
      input.legalName ? nameSimilarity(input.legalName, candidateName) : 0,
    );
    if (nameScore < MIN_NAME_SCORE) continue;

    const distanceScore = 1 - meters / MAX_MATCH_DISTANCE_METERS;
    const confidence = 0.75 * nameScore + 0.25 * distanceScore;
    if (confidence < minConfidence) continue;

    const facts: GooglePlaceFacts = {
      googlePlaceId: id,
      ratingTenths: toRatingTenths(place.rating),
      reviewCount: toCount(place.userRatingCount),
      priceLevel: toPriceLevel(place.priceLevel),
      phone: nonEmpty(place.nationalPhoneNumber),
      websiteUrl: nonEmpty(place.websiteUri),
      businessStatus: nonEmpty(place.businessStatus),
      openingHours: place.regularOpeningHours
        ? {
            openNow: place.regularOpeningHours.openNow,
            weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions,
            periods: place.regularOpeningHours.periods,
          }
        : null,
      fetchedAt: new Date().toISOString(),
    };

    const candidate: GooglePlaceMatch = {
      facts,
      confidence: Math.round(confidence * 100) / 100,
      nameScore: Math.round(nameScore * 100) / 100,
      distanceMeters: Math.round(meters),
      matchedName: candidateName,
    };

    if (!best || candidate.confidence > best.confidence) best = candidate;
  }

  return best;
}

async function searchTextOnce(
  textQuery: string,
  input: PlaceLookupInput,
  timeoutMs: number | undefined,
  key: string,
): Promise<SearchTextResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 10_000);

  let response: Response;
  try {
    response = await fetch(SEARCH_TEXT_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        locationBias: {
          circle: {
            center: { latitude: input.lat, longitude: input.lng },
            radius: SEARCH_RADIUS_METERS,
          },
        },
        languageCode: "fr",
        regionCode: "FR",
        // page size does not change the billed SKU, only the FieldMask does.
        pageSize: 10,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new PlacesError("Google took too long to answer.", true);
    }
    throw new PlacesError("Could not reach Google Places.", true);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "[places] Google refused",
      response.status,
      detail.slice(0, 500),
    );
    throw errorFor(response.status, detail);
  }

  return (await response.json().catch(() => ({}))) as SearchTextResponse;
}

// the body follows AIP-193 but can also be HTML when the failure comes from an
// intermediary, hence reading it as text and parsing defensively.
function errorFor(status: number, detail: string): PlacesError {
  let googleStatus = "";
  try {
    const parsed = JSON.parse(detail) as { error?: { status?: string } };
    googleStatus = parsed.error?.status ?? "";
  } catch {
    googleStatus = "";
  }

  if (status === 401) {
    return new PlacesError(
      "Google Places rejected the API key. Check GOOGLE_PLACES_API_KEY.",
      false,
    );
  }
  if (status === 403) {
    return new PlacesError(
      "Google Places refused the key: API disabled, billing missing, or usage restriction.",
      false,
    );
  }
  if (status === 400) {
    return new PlacesError(
      "Google Places rejected the request (invalid parameter or FieldMask).",
      false,
    );
  }
  if (status === 404) {
    return new PlacesError("This place no longer exists on Google.", false);
  }
  if (status === 429 || googleStatus === "RESOURCE_EXHAUSTED") {
    return new PlacesError(
      "Google Places quota exceeded. Try again later.",
      true,
    );
  }
  return new PlacesError(
    `Google Places answered ${status}.`,
    status >= 500 || googleStatus === "UNAVAILABLE" || googleStatus === "INTERNAL",
  );
}

// one billed request, the cheapest honest proof that a key works before it is saved
export async function checkPlacesKey(
  key: string,
): Promise<{ ok: true; message: null } | { ok: false; message: string }> {
  try {
    await searchTextOnce(
      "mairie",
      { name: "mairie", lat: 48.8566, lng: 2.3522 },
      10_000,
      key,
    );
    return { ok: true, message: null };
  } catch (error) {
    if (error instanceof PlacesError) return { ok: false, message: error.message };
    return { ok: false, message: "Google did not answer." };
  }
}
