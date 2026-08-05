// Game rules: ranks, progress points, tiers, streaks and seasons.
// Pure module: no database, no network, no React, no clock (the reference date
// is injected). `xpFor` is evaluated at event time and written to `events.xp`;
// changing a constant here must not move a tier already reached.

import { DEFAULT_PRICE_GRID } from "@/lib/priceGrid";
import type { EventKind, PlaceScore, PriceGrid } from "@/lib/types";

// unit of account of the whole game. The scale follows the ACCOUNT's grid:
// measured against another grid, an account selling higher would see every
// target at the top rank.
export function standardDealCents(grid: PriceGrid = DEFAULT_PRICE_GRID): number {
  return grid.fullSiteCents + grid.valueHorizonMonths * grid.recurringBaseCents;
}

export const STANDARD_DEAL_CENTS = standardDealCents(DEFAULT_PRICE_GRID);

// a rank is encoded by colour, diameter and ring together; never render it by
// colour alone. Keys are ASCII identifiers, never translated.
export type RankKey = "stall" | "counting-house" | "townhouse" | "stronghold" | "citadel";

export type Rank = {
  key: RankKey;
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  dotPx: number;
  ringPx: number;
  halo: boolean;
  colorVar: `--rank-${1 | 2 | 3 | 4 | 5}`;
  minExpectancyCents: number;
};

// highest first: this is the lookup order. `part` is the fraction of the
// standard deal at which the rank starts, so thresholds follow the grid.
const RANK_SHAPES: readonly (Omit<Rank, "minExpectancyCents"> & {
  part: number;
})[] = [
  { key: "citadel", level: 5, label: "Citadel", dotPx: 20, ringPx: 2, halo: true, colorVar: "--rank-5", part: 1 },
  { key: "stronghold", level: 4, label: "Stronghold", dotPx: 16, ringPx: 1.5, halo: false, colorVar: "--rank-4", part: 1 / 2 },
  { key: "townhouse", level: 3, label: "Townhouse", dotPx: 13, ringPx: 0, halo: false, colorVar: "--rank-3", part: 1 / 4 },
  { key: "counting-house", level: 2, label: "Counting House", dotPx: 10, ringPx: 0, halo: false, colorVar: "--rank-2", part: 1 / 10 },
  { key: "stall", level: 1, label: "Stall", dotPx: 8, ringPx: 0, halo: false, colorVar: "--rank-1", part: 0 },
];

export function ranksFor(grid: PriceGrid = DEFAULT_PRICE_GRID): readonly Rank[] {
  const standard = standardDealCents(grid);
  return RANK_SHAPES.map(({ part, ...shape }) => ({
    ...shape,
    minExpectancyCents: Math.round(standard * part),
  }));
}

export const RANKS: readonly Rank[] = ranksFor(DEFAULT_PRICE_GRID);

function rankIndex(ranks: readonly Rank[]): Record<RankKey, Rank> {
  return Object.fromEntries(ranks.map((rank) => [rank.key, rank])) as Record<
    RankKey,
    Rank
  >;
}

const RANK_BY_KEY: Record<RankKey, Rank> = rankIndex(RANKS);

export function rankByKey(key: RankKey, grid?: PriceGrid): Rank {
  return grid ? rankIndex(ranksFor(grid))[key] : RANK_BY_KEY[key];
}

export type Rarity = {
  rank: Rank;
  expectancyCents: number;
  offGrid: boolean;
  reason: string;
};

// an off-grid target is not a zero-value target: its expectancy is zero by
// construction, so the rank comes from the establishment count instead, and
// the UI must present those separately rather than let them sink in a sort.
export function rarityOf(
  score: PlaceScore,
  establishmentCount: number | null = null,
  grid: PriceGrid = DEFAULT_PRICE_GRID,
): Rarity {
  const ranks = grid === DEFAULT_PRICE_GRID ? RANKS : ranksFor(grid);

  if (score.price.kind === "off-grid") {
    return offGridRarity(establishmentCount, ranks);
  }

  const expectancyCents = Math.max(0, Math.round(score.expectancyCents));
  const rank = ranks.find((candidate) => expectancyCents >= candidate.minExpectancyCents)!;

  return {
    rank,
    expectancyCents,
    offGrid: false,
    reason: `expected ${eurosRoundedLabel(expectancyCents)} · ${score.success.percent} % of ${eurosRoundedLabel(score.price.value12MonthsCents)}`,
  };
}

function offGridRarity(count: number | null, ranks: readonly Rank[]): Rarity {
  const byKey = rankIndex(ranks);
  let rank: Rank;
  let fact: string;

  if (count !== null && count >= 5) {
    rank = byKey.citadel;
    fact = `${count} open establishments`;
  } else if (count !== null && count >= 2) {
    rank = byKey.stronghold;
    fact = `${count} open establishments`;
  } else {
    rank = byKey.townhouse;
    fact = "one address, scope to confirm";
  }

  return {
    rank,
    expectancyCents: 0,
    offGrid: true,
    reason: `off-grid · ${fact}`,
  };
}

// fr-FR is pinned, like `lib/format.ts`, so server and client render the same
// string.
function eurosRoundedLabel(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}

// `reply` is emitted by no gesture of the product today; no threshold may
// depend on it.
export const XP_BASE: Record<EventKind, number> = {
  survey: 1,
  study: 3,
  contact: 8,
  reply: 15,
  take: 100,
  withdrawal: 5,
};

export const XP_WEIGHT_FLOOR = 0.5;
export const XP_WEIGHT_CEILING = 3;

export function lootWeight(
  score: PlaceScore | null | undefined,
  grid: PriceGrid = DEFAULT_PRICE_GRID,
): number {
  if (!score || score.price.kind === "off-grid") return 1;
  const value = score.price.value12MonthsCents;
  if (!Number.isFinite(value) || value <= 0) return 1;
  const ratio = value / standardDealCents(grid);
  return Math.min(XP_WEIGHT_CEILING, Math.max(XP_WEIGHT_FLOOR, ratio));
}

export function xpFor(
  kind: EventKind,
  score: PlaceScore | null = null,
  grid: PriceGrid = DEFAULT_PRICE_GRID,
): number {
  const base = XP_BASE[kind];
  return Math.max(1, Math.round(base * lootWeight(score, grid)));
}

// total progress one sector can yield from spotting, whatever its size. Past
// the cap the event is still logged, it is simply worth zero.
export const XP_HARVEST_CAP = XP_BASE.take;

export function xpForSpotting(alreadySpotted: number): number {
  const already = Number.isFinite(alreadySpotted) ? Math.max(0, Math.floor(alreadySpotted)) : 0;
  return already < XP_HARVEST_CAP ? xpFor("survey") : 0;
}

// the events a deal carried end to end actually produces; the second tier
// threshold is calibrated on this list.
export const FULL_DEAL_KINDS: readonly EventKind[] = [
  "survey",
  "study",
  "contact",
  "take",
];

export type Tier = {
  level: number;
  label: string;
  floorXp: number;
};

export const TIERS: readonly Tier[] = [
  { level: 1, label: "Scout", floorXp: 0 },
  { level: 2, label: "Surveyor", floorXp: 112 },
  { level: 3, label: "Land Surveyor", floorXp: 400 },
  { level: 4, label: "Cartographer", floorXp: 900 },
  { level: 5, label: "Builder", floorXp: 1_800 },
  { level: 6, label: "Steward", floorXp: 3_600 },
  { level: 7, label: "Strategist", floorXp: 7_200 },
  { level: 8, label: "Governor", floorXp: 14_400 },
];

export type Level = {
  level: number;
  label: string;
  xp: number;
  floorXp: number;
  /** `null` on the last tier. */
  nextXp: number | null;
  /** `null` on the last tier. */
  toNextXp: number | null;
  /** Progress WITHIN the tier, 0 to 1. */
  progress: number;
};

export function levelFor(totalXp: number): Level {
  const xp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;

  let index = 0;
  for (let i = TIERS.length - 1; i >= 0; i -= 1) {
    if (xp >= TIERS[i]!.floorXp) {
      index = i;
      break;
    }
  }

  const tier = TIERS[index]!;
  const next = TIERS[index + 1] ?? null;

  if (!next) {
    return {
      level: tier.level,
      label: tier.label,
      xp,
      floorXp: tier.floorXp,
      nextXp: null,
      toNextXp: null,
      progress: 1,
    };
  }

  const span = next.floorXp - tier.floorXp;
  return {
    level: tier.level,
    label: tier.label,
    xp,
    floorXp: tier.floorXp,
    nextXp: next.floorXp,
    toNextXp: next.floorXp - xp,
    progress: span > 0 ? Math.min(1, Math.max(0, (xp - tier.floorXp) / span)) : 1,
  };
}

export const STREAK_KINDS: readonly EventKind[] = ["contact", "take"];

export type StreakEvent = {
  kind: EventKind;
  occurredAt: Date | string | number;
};

export type Streak = {
  days: number;
  /** `YYYY-MM-DD`, Europe/Paris day of the last qualifying event. */
  lastDay: string | null;
  aliveToday: boolean;
  atRisk: boolean;
};

// `occurred_at` is stored in UTC, so days must be cut in Europe/Paris: an event
// at 00:30 Paris carries the previous UTC date. `sv-SE` is the only locale
// whose short format is exactly `YYYY-MM-DD`, hence sortable as a string.
export function dayKeyParis(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// goes through UTC noon, so a DST change cannot skip a day.
function previousDay(dayKey: string): string {
  const noon = new Date(`${dayKey}T12:00:00.000Z`);
  noon.setUTCDate(noon.getUTCDate() - 1);
  return noon.toISOString().slice(0, 10);
}

export function streakFrom(
  events: readonly StreakEvent[],
  now: Date = new Date(),
): Streak {
  const qualifying = new Set(STREAK_KINDS);
  const days = new Set<string>();

  for (const event of events) {
    if (!qualifying.has(event.kind)) continue;
    const key = dayKeyParis(event.occurredAt);
    if (key !== "") days.add(key);
  }

  const today = dayKeyParis(now);
  const yesterday = previousDay(today);

  if (days.size === 0) {
    return { days: 0, lastDay: null, aliveToday: false, atRisk: false };
  }

  const lastDay = [...days].sort().at(-1)!;

  if (lastDay !== today && lastDay !== yesterday) {
    return { days: 0, lastDay, aliveToday: false, atRisk: false };
  }

  let cursor = lastDay;
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = previousDay(cursor);
  }

  const aliveToday = lastDay === today;
  return { days: count, lastDay, aliveToday, atRisk: !aliveToday };
}

export const SEASON_DAYS = 30;

export type Season = {
  startsAt: Date;
  now: Date;
  endsAt: Date;
  daysLeft: number;
};

// thirty days from a FIXED origin, not a rolling window: the origin is
// arbitrary but must stay stable, or "12 days left" moves with the observer.
export function seasonAt(
  now: Date = new Date(),
  originIso = "2026-01-01T00:00:00.000Z",
): Season {
  const origin = new Date(originIso).getTime();
  const spanMs = SEASON_DAYS * 24 * 60 * 60 * 1000;
  const elapsed = Math.max(0, now.getTime() - origin);
  const index = Math.floor(elapsed / spanMs);
  const startsAt = new Date(origin + index * spanMs);
  const endsAt = new Date(origin + (index + 1) * spanMs);
  return {
    startsAt,
    now,
    endsAt,
    daysLeft: Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000)),
  };
}
