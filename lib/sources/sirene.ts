// Establishment harvest from recherche-entreprises.api.gouv.fr: free, public,
// no API key. Server-only, because the quota is counted per IP address. It
// collects facts, nothing is scored or priced here.

import type { Bbox, DirectorFact, SireneEstablishment } from "../types";

const NEAR_POINT_URL = "https://recherche-entreprises.api.gouv.fr/near_point";

/** The API answers 400 above 25. */
export const SIRENE_MAX_PER_PAGE = 25;

/** Kilometres. Outside these bounds the API answers 400. */
export const SIRENE_MIN_RADIUS_KM = 0.001;
export const SIRENE_MAX_RADIUS_KM = 50;

// `page * per_page` cannot exceed 10 000; a wide area simply reports
// `total_results: 10000`. Splitting it into sub-circles is the caller's job.
export const SIRENE_MAX_RESULT_WINDOW = 10_000;

/** Hard call cap for one harvest. When it bites, `truncated` says so. */
export const SIRENE_MAX_REQUESTS_PER_HARVEST = 120;

// 20 concurrent requests return 7 x `429`; 85 pages spaced 200 ms apart never
// triggered one.
export const SIRENE_MIN_INTERVAL_MS = 200;

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_ATTEMPTS = 3;

export type NafTarget = {
  /** NAF 2008, format `XX.XXY`. NAF 2025 codes are refused by the API. */
  code: string;
  /** Official French INSEE label; there is no English nomenclature. */
  label: string;
};

/** Core target: bakeries, pastry shops, restaurants, bars. */
export const SIRENE_TARGET_NAF: readonly NafTarget[] = [
  { code: "10.71C", label: "Boulangerie et boulangerie-pâtisserie" },
  { code: "10.71D", label: "Pâtisserie" },
  { code: "56.10A", label: "Restauration traditionnelle" },
  { code: "56.10C", label: "Restauration de type rapide" },
  { code: "56.30Z", label: "Débits de boissons" },
];

// opt-in widening, never on by default: `56.21Z` holds ghost kitchens with no
// storefront.
export const SIRENE_EXTRA_NAF: readonly NafTarget[] = [
  {
    code: "47.24Z",
    label: "Commerce de détail de pain, pâtisserie et confiserie en magasin spécialisé",
  },
  { code: "10.71B", label: "Cuisson de produits de boulangerie" },
  { code: "10.52Z", label: "Fabrication de glaces et sorbets" },
  { code: "56.21Z", label: "Services des traiteurs" },
];

// deliberately excluded, do not add back: 56.10B/56.29A/56.29B (canteens and
// contract catering), 47.29Z/47.25Z/47.11B (grocery, wine, convenience).

export const SIRENE_DEFAULT_NAF_CODES: readonly string[] = SIRENE_TARGET_NAF.map(
  (target) => target.code,
);

const NAF_LABELS: ReadonlyMap<string, string> = new Map(
  [...SIRENE_TARGET_NAF, ...SIRENE_EXTRA_NAF].map((target) => [
    target.code,
    target.label,
  ]),
);

export function nafLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return NAF_LABELS.get(code.trim().toUpperCase()) ?? null;
}

export class SireneError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** 0 lets the caller's backoff decide. */
    readonly retryDelayMs: number = 0,
  ) {
    super(message);
    this.name = "SireneError";
  }
}

export type SireneRawDirector = {
  nom?: string | null;
  prenoms?: string | null;
  denomination?: string | null;
  qualite?: string | null;
  type_dirigeant?: string | null;
};

/** A raw establishment: `siege` and each `matching_etablissements[]`. */
export type SireneRawEstablishment = {
  siret?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  commune?: string | null;
  libelle_commune?: string | null;
  /** Arrives as a STRING, sometimes null. */
  latitude?: string | null;
  longitude?: string | null;
  liste_enseignes?: string[] | null;
  nom_commercial?: string | null;
  activite_principale?: string | null;
  etat_administratif?: string | null;
  statut_diffusion_etablissement?: string | null;
  tranche_effectif_salarie?: string | null;
  est_siege?: boolean | null;
  ancien_siege?: boolean | null;
  date_fermeture?: string | null;
};

/** One filed financial year. The API reports amounts in EUROS, not cents. */
export type SireneRawFinances = {
  ca?: number | null;
  resultat_net?: number | null;
};

export type SireneRawResult = {
  siren?: string | null;
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  sigle?: string | null;
  nombre_etablissements?: number | null;
  nombre_etablissements_ouverts?: number | null;
  siege?: SireneRawEstablishment | null;
  activite_principale?: string | null;
  categorie_entreprise?: string | null;
  date_creation?: string | null;
  date_fermeture?: string | null;
  etat_administratif?: string | null;
  tranche_effectif_salarie?: string | null;
  statut_diffusion?: string | null;
  dirigeants?: SireneRawDirector[] | null;
  matching_etablissements?: SireneRawEstablishment[] | null;
  finances?: Record<string, SireneRawFinances> | null;
};

export type SireneSearchResponse = {
  results: SireneRawResult[];
  total_results: number;
  page: number;
  per_page: number;
  total_pages: number;
};

/** One degree of latitude, in kilometres. WGS 84 mean value. */
const DEGREE_KM = 111.194927;

/** Bounds included. */
export function bboxContains(bbox: Bbox, lat: number, lng: number): boolean {
  const minLat = Math.min(bbox.minLat, bbox.maxLat);
  const maxLat = Math.max(bbox.minLat, bbox.maxLat);
  const minLng = Math.min(bbox.minLng, bbox.maxLng);
  const maxLng = Math.max(bbox.minLng, bbox.maxLng);
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

// smallest circle CONTAINING the frame; the overflow is dropped downstream.
export function circleForBbox(bbox: Bbox): {
  lat: number;
  lng: number;
  radiusKm: number;
} {
  const minLat = Math.min(bbox.minLat, bbox.maxLat);
  const maxLat = Math.max(bbox.minLat, bbox.maxLat);
  const minLng = Math.min(bbox.minLng, bbox.maxLng);
  const maxLng = Math.max(bbox.minLng, bbox.maxLng);

  const lat = (minLat + maxLat) / 2;
  const lng = (minLng + maxLng) / 2;

  const halfHeightKm = ((maxLat - minLat) / 2) * DEGREE_KM;
  // a degree of longitude shrinks with latitude; without the cosine the circle
  // is a third too large.
  const halfWidthKm =
    ((maxLng - minLng) / 2) * DEGREE_KM * Math.cos((lat * Math.PI) / 180);

  const radiusKm = Math.hypot(halfHeightKm, halfWidthKm);

  return { lat, lng, radiusKm: clampRadius(radiusKm) };
}

function clampRadius(radiusKm: number): number {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return SIRENE_MIN_RADIUS_KM;
  return Math.min(SIRENE_MAX_RADIUS_KM, Math.max(SIRENE_MIN_RADIUS_KM, radiusKm));
}

// one queue per MODULE, not per harvest: the quota is per IP address, so
// concurrent harvests must share it.
let queueTail: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const wait = SIRENE_MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return task();
  });
  // swallowed so one failure does not kill the queue; the caller still sees it.
  queueTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type NearPointParams = {
  lat: number;
  lng: number;
  /** In KILOMETRES. */
  radiusKm: number;
  /** NAF 2008 only. Empty means no activity filter. */
  nafCodes?: readonly string[];
  page?: number;
  perPage?: number;
  timeoutMs?: number;
  attempts?: number;
};

export async function searchNearPoint(
  params: NearPointParams,
): Promise<SireneSearchResponse> {
  const attempts = Math.max(1, params.attempts ?? DEFAULT_ATTEMPTS);
  let last: SireneError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await schedule(() => searchOnce(params));
    } catch (error) {
      if (!(error instanceof SireneError) || !error.retryable) throw error;
      last = error;
      if (attempt < attempts) {
        await sleep(error.retryDelayMs || 400 * attempt);
      }
    }
  }

  throw last ?? new SireneError("The company registry did not answer.", true);
}

async function searchOnce(
  params: NearPointParams,
): Promise<SireneSearchResponse> {
  const perPage = Math.min(
    SIRENE_MAX_PER_PAGE,
    Math.max(1, params.perPage ?? SIRENE_MAX_PER_PAGE),
  );
  const page = Math.max(1, params.page ?? 1);

  const url = new URL(NEAR_POINT_URL);
  url.searchParams.set("lat", String(params.lat));
  url.searchParams.set("long", String(params.lng));
  url.searchParams.set("radius", String(clampRadius(params.radiusKm)));
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  if (params.nafCodes && params.nafCodes.length > 0) {
    url.searchParams.set("activite_principale", params.nafCodes.join(","));
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
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
      throw new SireneError(
        "The company registry took too long to answer.",
        true,
      );
    }
    throw new SireneError("Could not reach the company registry.", true);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // the body of a 429 is nginx HTML, not JSON: read the status before
    // parsing, or a SyntaxError hides the real cause.
    const detail = await response.text().catch(() => "");
    console.error(
      "[sirene] registry refused",
      response.status,
      detail.slice(0, 500),
    );

    if (response.status === 429) {
      throw new SireneError(
        "The company registry is rate-limiting. Try again in a moment.",
        true,
        1_500,
      );
    }
    if (response.status === 400) {
      throw new SireneError(
        `Request refused by the registry: ${readErrorMessage(detail)}`,
        false,
      );
    }
    throw new SireneError(
      `The company registry answered ${response.status}.`,
      response.status >= 500,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SireneError("Unreadable answer from the company registry.", true);
  }

  const body = payload as Partial<SireneSearchResponse>;
  if (!Array.isArray(body.results)) {
    throw new SireneError("Unexpected answer from the company registry.", true);
  }

  return {
    results: body.results,
    total_results: numberOr(body.total_results, 0),
    page: numberOr(body.page, page),
    per_page: numberOr(body.per_page, perPage),
    total_pages: numberOr(body.total_pages, 0),
  };
}

/** A 400 does return JSON: `{"erreur":"..."}`, already worded by the API. */
function readErrorMessage(detail: string): string {
  try {
    const parsed = JSON.parse(detail) as { erreur?: string };
    if (typeof parsed.erreur === "string" && parsed.erreur !== "") {
      return parsed.erreur;
    }
  } catch {
    // not JSON: fall back to the raw excerpt.
  }
  return detail.slice(0, 200) || "no reason given.";
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// what was read and what was dropped: a filter that never rejects anything is
// broken, and without counters that does not show.
export type HarvestTally = {
  companies: number;
  /** (company, establishment) pairs examined. */
  establishments: number;
  kept: number;
  rejectedOutsideBbox: number;
  rejectedBadCoordinates: number;
  /** Right to object exercised, on the company or the establishment. */
  rejectedNotDiffusible: number;
  /** `etat_administratif` other than `A`. */
  rejectedClosed: number;
  rejectedCompanyClosed: number;
  /** Back offices, and establishments still on the 2003 rev1 nomenclature. */
  rejectedNafOutOfScope: number;
  rejectedNoSiret: number;
  rejectedDuplicate: number;
};

export function createTally(): HarvestTally {
  return {
    companies: 0,
    establishments: 0,
    kept: 0,
    rejectedOutsideBbox: 0,
    rejectedBadCoordinates: 0,
    rejectedNotDiffusible: 0,
    rejectedClosed: 0,
    rejectedCompanyClosed: 0,
    rejectedNafOutOfScope: 0,
    rejectedNoSiret: 0,
    rejectedDuplicate: 0,
  };
}

export type NormalizeOptions = {
  /**
   * NAF allow-list applied to the ESTABLISHMENT. The API's own
   * `activite_principale` filter matches on the COMPANY, so a chain's back
   * office comes back as a restaurant. Omitting it disables the check.
   */
  nafCodes?: readonly string[];
  /** Mutable, shared across the pages of one harvest. */
  tally?: HarvestTally;
  seenSirets?: Set<string>;
};

/** `bbox` is the drawn frame, not the queried circle. */
export function normalizeEstablishments(
  response: SireneSearchResponse,
  bbox: Bbox,
  options: NormalizeOptions = {},
): SireneEstablishment[] {
  const tally = options.tally ?? createTally();
  const seen = options.seenSirets ?? new Set<string>();
  const naf = normalizeNafFilter(options.nafCodes);

  const out: SireneEstablishment[] = [];

  for (const company of response.results) {
    tally.companies += 1;

    // `statut_diffusion` other than "O" is an exercised right to object: never
    // stored, never displayed. A missing value counts as a refusal.
    if (company.statut_diffusion !== "O") {
      tally.rejectedNotDiffusible += countEstablishments(company);
      tally.establishments += countEstablishments(company);
      continue;
    }

    if (company.etat_administratif && company.etat_administratif !== "A") {
      tally.rejectedCompanyClosed += countEstablishments(company);
      tally.establishments += countEstablishments(company);
      continue;
    }

    const finances = latestFinances(company.finances);
    const directors = keepRealDirectors(company.dirigeants);
    const legalName =
      trimmed(company.nom_raison_sociale) ?? trimmed(company.nom_complet);

    // walk `matching_etablissements`, NEVER `siege`: `near_point` returns the
    // whole company as soon as one establishment touches the radius, and the
    // head office can be tens of kilometres away.
    const candidates = company.matching_etablissements ?? [];

    for (const raw of candidates) {
      tally.establishments += 1;

      // right to object, establishment half. Same rule, same reason.
      if (raw.statut_diffusion_etablissement !== "O") {
        tally.rejectedNotDiffusible += 1;
        continue;
      }

      // closed establishments stay in the answer, and `date_fermeture` is
      // sometimes null on one, so trust `etat_administratif`.
      if (raw.etat_administratif !== "A") {
        tally.rejectedClosed += 1;
        continue;
      }

      // `latitude` and `longitude` arrive as STRINGS, sometimes null. A NaN
      // would insert as null and fail the whole harvest on a NOT NULL column.
      const lat = toCoordinate(raw.latitude);
      const lng = toCoordinate(raw.longitude);
      if (lat === null || lng === null) {
        tally.rejectedBadCoordinates += 1;
        continue;
      }

      if (!bboxContains(bbox, lat, lng)) {
        tally.rejectedOutsideBbox += 1;
        continue;
      }

      const establishmentNaf = trimmed(raw.activite_principale);
      if (naf && (!establishmentNaf || !naf.has(establishmentNaf.toUpperCase()))) {
        tally.rejectedNafOutOfScope += 1;
        continue;
      }

      const siret = trimmed(raw.siret);
      if (!siret) {
        tally.rejectedNoSiret += 1;
        continue;
      }
      if (seen.has(siret)) {
        tally.rejectedDuplicate += 1;
        continue;
      }
      seen.add(siret);

      tally.kept += 1;
      out.push({
        siren: trimmed(company.siren) ?? siret.slice(0, 9),
        siret,
        name: pickName(raw, company),
        legalName,
        naf: establishmentNaf,
        nafLabel: nafLabel(establishmentNaf),
        address: trimmed(raw.adresse),
        postalCode: trimmed(raw.code_postal),
        city: trimmed(raw.libelle_commune) ?? trimmed(raw.commune),
        lat,
        lng,
        establishmentCount: integerOrNull(company.nombre_etablissements_ouverts),
        companyCreatedAt: trimmed(company.date_creation),
        // the establishment band describes the shop, the company band the group.
        employeeRange:
          trimmed(raw.tranche_effectif_salarie) ??
          trimmed(company.tranche_effectif_salarie),
        companyCategory: trimmed(company.categorie_entreprise),
        revenueCents: finances.revenueCents,
        netIncomeCents: finances.netIncomeCents,
        financesYear: finances.year,
        directors,
      });
    }
  }

  return out;
}

function countEstablishments(company: SireneRawResult): number {
  return (company.matching_etablissements ?? []).length;
}

function normalizeNafFilter(
  codes: readonly string[] | undefined,
): Set<string> | null {
  if (!codes || codes.length === 0) return null;
  return new Set(codes.map((code) => code.trim().toUpperCase()));
}

// `liste_enseignes` and `nom_commercial` carry the name on the shopfront when
// present; `nom_complet` is a last resort and is often a legal name.
function pickName(
  raw: SireneRawEstablishment,
  company: SireneRawResult,
): string {
  const business = (raw.liste_enseignes ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value !== "");
  return (
    business ??
    trimmed(raw.nom_commercial) ??
    trimmed(company.nom_complet) ??
    trimmed(company.nom_raison_sociale) ??
    "Unnamed"
  );
}

// `dirigeants[]` also contains statutory AUDITORS, who must not be called;
// hence the three cumulative conditions below. Matching is folded because
// accented and unaccented spellings both occur in the data. Only the name and
// the role are kept: no personal contact detail of a director is stored.

const DIRECTION_KEYWORDS = [
  "gerant",
  "president",
  "directeur",
  "directrice",
  "directoire",
  "associe",
  "administrateur",
  "dirigeant",
];

function keepRealDirectors(
  raw: SireneRawDirector[] | null | undefined,
): DirectorFact[] {
  const out: DirectorFact[] = [];

  for (const director of raw ?? []) {
    if (director.type_dirigeant !== "personne physique") continue;

    const qualite = trimmed(director.qualite);
    if (!qualite) continue;

    const flat = deaccent(qualite);
    if (flat.includes("commissaire")) continue;
    if (!DIRECTION_KEYWORDS.some((keyword) => flat.includes(keyword))) continue;

    const lastName = trimmed(director.nom);
    if (!lastName) continue;

    out.push({ lastName, firstNames: trimmed(director.prenoms), title: qualite });
  }

  return out;
}

/** For comparing labels, never for display. */
function deaccent(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

type Finances = {
  revenueCents: number | null;
  netIncomeCents: number | null;
  year: number | null;
};

// only one year is served per company, so it is returned alongside the amounts.
// `ca: 0` means "accounts not filed", not "zero euros", hence `null`.
function latestFinances(
  finances: Record<string, SireneRawFinances> | null | undefined,
): Finances {
  const empty: Finances = { revenueCents: null, netIncomeCents: null, year: null };
  if (!finances) return empty;

  let bestYear: number | null = null;
  for (const key of Object.keys(finances)) {
    const year = Number.parseInt(key, 10);
    if (!Number.isInteger(year)) continue;
    if (bestYear === null || year > bestYear) bestYear = year;
  }
  if (bestYear === null) return empty;

  const entry = finances[String(bestYear)];
  if (!entry) return empty;

  const ca = typeof entry.ca === "number" && entry.ca !== 0 ? entry.ca : null;
  const net = typeof entry.resultat_net === "number" ? entry.resultat_net : null;

  // accounts not filed: no amount, and no year either.
  if (ca === null && (net === null || net === 0)) return empty;

  return {
    revenueCents: eurosToCents(ca),
    netIncomeCents: eurosToCents(net),
    year: bestYear,
  };
}

// euros to INTEGER cents without a float round-trip: `1234.56 * 100` is
// `123455.99999999999`, so the decimal point is shifted on the decimal writing.
// A Postgres `integer` is 32-bit, hence `bigint` on `revenue_cents` and
// `net_income_cents`.
function eurosToCents(euros: number | null): number | null {
  if (euros === null || !Number.isFinite(euros)) return null;
  if (Math.abs(euros) > Number.MAX_SAFE_INTEGER / 100) return null;

  const text = euros.toFixed(2);
  const negative = text.startsWith("-");
  const [whole = "0", frac = "00"] = (negative ? text.slice(1) : text).split(".");
  const cents = Number(`${whole}${frac.padEnd(2, "0").slice(0, 2)}`);
  if (!Number.isSafeInteger(cents)) return null;

  return negative ? -cents : cents;
}

function toCoordinate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function trimmed(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const out = value.trim();
  return out === "" ? null : out;
}

function integerOrNull(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

export type HarvestParams = {
  /** The drawn frame. The queried circle is derived from it. */
  bbox: Bbox;
  /** NAF 2008. Defaults to the core target. */
  nafCodes?: readonly string[];
  /** Clamped by `SIRENE_MAX_REQUESTS_PER_HARVEST`. */
  maxRequests?: number;
  onPage?: (progress: {
    page: number;
    kept: number;
    totalResults: number;
  }) => void;
};

export type HarvestResult = {
  establishments: SireneEstablishment[];
  tally: HarvestTally;
  requests: number;
  /** `total_results` from the first page. A FLOOR, and it saturates at 10 000. */
  totalResults: number;
  truncated: boolean;
  /** `total_results` saturated: the area is too wide, split it. */
  saturated: boolean;
};

// stops on an EMPTY page, not on `total_pages`: the API keeps serving distinct
// results past the last announced page.
export async function harvestArea(params: HarvestParams): Promise<HarvestResult> {
  const bbox = params.bbox;
  const circle = circleForBbox(bbox);
  const nafCodes = params.nafCodes ?? SIRENE_DEFAULT_NAF_CODES;
  const maxRequests = Math.min(
    SIRENE_MAX_REQUESTS_PER_HARVEST,
    Math.max(1, params.maxRequests ?? SIRENE_MAX_REQUESTS_PER_HARVEST),
  );

  const tally = createTally();
  const seenSirets = new Set<string>();
  const establishments: SireneEstablishment[] = [];

  let requests = 0;
  let totalResults = 0;
  let truncated = false;

  for (let page = 1; page <= maxRequests; page += 1) {
    if (page * SIRENE_MAX_PER_PAGE > SIRENE_MAX_RESULT_WINDOW) {
      // past the window the API answers 400.
      truncated = true;
      break;
    }

    const response = await searchNearPoint({
      lat: circle.lat,
      lng: circle.lng,
      radiusKm: circle.radiusKm,
      nafCodes,
      page,
      perPage: SIRENE_MAX_PER_PAGE,
    });
    requests += 1;
    if (page === 1) totalResults = response.total_results;

    if (response.results.length === 0) break;

    const batch = normalizeEstablishments(response, bbox, {
      nafCodes,
      tally,
      seenSirets,
    });
    establishments.push(...batch);

    params.onPage?.({ page, kept: establishments.length, totalResults });

    if (page === maxRequests) truncated = true;
  }

  return {
    establishments,
    tally,
    requests,
    totalResults,
    truncated,
    saturated: totalResults >= SIRENE_MAX_RESULT_WINDOW,
  };
}
