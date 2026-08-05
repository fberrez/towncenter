// pure module: no database, no network, no React, no implicit clock. Types come
// from @/app/queries as `import type` ONLY, or the Postgres driver lands in the
// browser bundle.

import type {
  JournalEntry,
  TargetCluster,
  TargetRow,
} from "@/app/queries";
import {
  STREAK_KINDS,
  dayKeyParis,
  xpFor,
  type Rank,
  type StreakEvent,
} from "@/lib/game";
import { distanceMeters } from "@/lib/geo";
import { CLUSTER_RADIUS_METERS } from "@/lib/limits";
import { CALIBRATION_MIN_OUTCOMES, type EventKind } from "@/lib/types";

// same set as getZoneStats and getClusters: three places, one definition.
const OUT_OF_PLAY: ReadonlySet<string> = new Set(["taken", "withdrawn", "dismissed"]);

export type VisibleReach = {
  /** cents, summed over the expectancies of businesses still to take. */
  cents: number;
  toTake: number;
  // off-grid businesses are counted apart and never folded into `cents`: their
  // expectancy is zero by construction, they are not zero-euro targets.
  offGrid: number;
  captures: number;
  /** every category, dismissed ones included. */
  total: number;
  bestCents: number;
};

export function lootInView(targets: readonly TargetRow[]): VisibleReach {
  let cents = 0;
  let toTake = 0;
  let offGrid = 0;
  let captures = 0;
  let bestCents = 0;

  for (const target of targets) {
    if (target.state === "taken") captures += 1;
    if (OUT_OF_PLAY.has(target.state)) continue;

    toTake += 1;
    if (target.score.price.kind === "off-grid") {
      offGrid += 1;
      continue;
    }

    cents += target.score.expectancyCents;
    if (target.score.expectancyCents > bestCents) {
      bestCents = target.score.expectancyCents;
    }
  }

  return { cents, toTake, offGrid, captures, total: targets.length, bestCents };
}

// scores are recomputed on every read and nothing is snapshotted at decision
// time, so these figures compare TODAY's model against yesterday's decisions.
// events.xp is the one frozen datum; modelDrifted uses it as a movement detector.

export type CalibrationBand = {
  key: string;
  label: string;
  /** whole percentages, `min` and `max` both inclusive. */
  min: number;
  max: number;
  issues: number;
  captures: number;
  announced: number | null;
  /** observed take rate, as a whole percentage, null when the band is empty. */
  actual: number | null;
};

const BANDS: readonly { key: string; label: string; min: number; max: number }[] = [
  { key: "0-20", label: "0 to 20 %", min: 0, max: 20 },
  { key: "21-40", label: "21 to 40 %", min: 21, max: 40 },
  { key: "41-60", label: "41 to 60 %", min: 41, max: 60 },
  { key: "61-80", label: "61 to 80 %", min: 61, max: 80 },
  { key: "81-100", label: "81 to 100 %", min: 81, max: 100 },
];

export type ModelHonesty = {
  issues: number;
  calibrated: boolean;
  missing: number;
  captures: number;
  withdrawals: number;

  promisedCents: number;
  deliveredCents: number;
  /** `delivered / promised`, null while no take is comparable. */
  met: number | null;
  comparable: number;
  withoutAmount: number;
  /** off-grid takes, excluded: their announced price is zero by construction. */
  offGrid: number;

  bands: CalibrationBand[];

  /** takes whose frozen xp no longer matches what the model would give today. */
  modelDrifted: number;
};

// only the most recent take per business is kept: summing two takes on the same
// business would double a real amount.
export function measureModel(
  issues: readonly TargetRow[],
  captureEvents: readonly JournalEntry[],
): ModelHonesty {
  // listJournal returns most recent first, so the first entry seen wins.
  const captureByTarget = new Map<string, JournalEntry>();
  for (const entry of captureEvents) {
    if (entry.kind !== "take") continue;
    if (!captureByTarget.has(entry.targetId)) captureByTarget.set(entry.targetId, entry);
  }

  const buckets = BANDS.map((band) => ({
    ...band,
    issues: 0,
    captures: 0,
    announcedSum: 0,
  }));

  let captures = 0;
  let withdrawals = 0;
  let promisedCents = 0;
  let deliveredCents = 0;
  let comparable = 0;
  let withoutAmount = 0;
  let offGrid = 0;
  let modelDrifted = 0;

  for (const target of issues) {
    if (target.state !== "taken" && target.state !== "withdrawn") continue;

    const announced = target.score.success.percent;
    const bucket = buckets.find((candidate) => announced >= candidate.min && announced <= candidate.max);
    if (bucket) {
      bucket.issues += 1;
      bucket.announcedSum += announced;
      if (target.state === "taken") bucket.captures += 1;
    }

    if (target.state === "withdrawn") {
      withdrawals += 1;
      continue;
    }

    captures += 1;

    const input = captureByTarget.get(target.id);
    if (!input || input.valueCents === null || input.valueCents <= 0) {
      withoutAmount += 1;
      continue;
    }

    if (xpFor("take", target.score) !== input.xp) modelDrifted += 1;

    if (target.score.price.kind === "off-grid") {
      offGrid += 1;
      continue;
    }

    // events.valueCents holds the one-off take, not the subscription: compare it
    // to priceCents, never to the twelve-month value.
    promisedCents += target.score.price.priceCents;
    deliveredCents += input.valueCents;
    comparable += 1;
  }

  const outcomeCount = captures + withdrawals;

  return {
    issues: outcomeCount,
    calibrated: outcomeCount >= CALIBRATION_MIN_OUTCOMES,
    missing: Math.max(0, CALIBRATION_MIN_OUTCOMES - outcomeCount),
    captures,
    withdrawals,
    promisedCents,
    deliveredCents,
    met: promisedCents > 0 ? deliveredCents / promisedCents : null,
    comparable,
    withoutAmount,
    offGrid,
    bands: buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      min: bucket.min,
      max: bucket.max,
      issues: bucket.issues,
      captures: bucket.captures,
      announced: bucket.issues > 0 ? Math.round(bucket.announcedSum / bucket.issues) : null,
      actual: bucket.issues > 0 ? Math.round((bucket.captures / bucket.issues) * 100) : null,
    })),
    modelDrifted,
  };
}

/** what the page does not prove, spelled out. */
export function caveats(met: ModelHonesty): string[] {
  const rows: string[] = [
    "Resistance is recomputed on every read: no column carries it. These figures therefore compare today’s model against decisions taken with yesterday’s.",
  ];

  if (!met.calibrated) {
    rows.push(
      `A band’s real rate is read from ${met.issues} outcome${met.issues > 1 ? "s" : ""} in total. It takes ${CALIBRATION_MIN_OUTCOMES} for the comparison to mean anything.`,
    );
  }

  if (met.withoutAmount > 0) {
    rows.push(
      `${met.withoutAmount} take${met.withoutAmount > 1 ? "s" : ""} with no amount entered: they drop out of the price comparison.`,
    );
  }

  if (met.offGrid > 0) {
    rows.push(
      `${met.offGrid} off-grid take${met.offGrid > 1 ? "s" : ""}: the announced price is zero there by construction, comparing it would be wrong.`,
    );
  }

  if (met.modelDrifted > 0) {
    rows.push(
      `${met.modelDrifted} take${met.modelDrifted > 1 ? "s" : ""} whose frozen progress no longer matches the current model: the grid or the facts have moved since.`,
    );
  }

  return rows;
}

// spelled out rather than taken from Intl: no hydration surprise.
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type MonthBanked = {
  /** `YYYY-MM`, sortable as a string. */
  key: string;
  label: string;
  /** cents actually signed, never an estimate. */
  cents: number;
  captures: number;
};

function previousMonth(key: string): string {
  const year = Number(key.slice(0, 4));
  const months = Number(key.slice(5, 7));
  if (months <= 1) return `${year - 1}-12`;
  return `${year}-${String(months - 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const months = Number(key.slice(5, 7));
  const name = SHORT_MONTHS[months - 1] ?? key;
  return `${name} ${key.slice(2, 4)}`;
}

// months are Europe/Paris, oldest first, empty ones kept: a take entered on the
// 1st at 00:30 Paris carries a UTC timestamp from the previous month.
export function bankedByMonth(
  captureEvents: readonly JournalEntry[],
  months = 12,
  now: Date = new Date(),
): MonthBanked[] {
  const total = new Map<string, { cents: number; captures: number }>();

  for (const entry of captureEvents) {
    if (entry.kind !== "take") continue;
    const day = dayKeyParis(entry.occurredAt);
    if (day === "") continue;
    const key = day.slice(0, 7);
    const bucket = total.get(key) ?? { cents: 0, captures: 0 };
    bucket.cents += entry.valueCents ?? 0;
    bucket.captures += 1;
    total.set(key, bucket);
  }

  const keys: string[] = [];
  let cursor = dayKeyParis(now).slice(0, 7);
  for (let index = 0; index < Math.max(1, months); index += 1) {
    keys.push(cursor);
    cursor = previousMonth(cursor);
  }

  return keys.reverse().map((key) => ({
    key,
    label: monthLabel(key),
    cents: total.get(key)?.cents ?? 0,
    captures: total.get(key)?.captures ?? 0,
  }));
}

function nextDay(key: string): string {
  // via UTC noon: adding 86 400 000 ms drops or duplicates a day twice a year,
  // on the daylight-saving switch.
  const noon = new Date(`${key}T12:00:00.000Z`);
  noon.setUTCDate(noon.getUTCDate() + 1);
  return noon.toISOString().slice(0, 10);
}

function previousDay(key: string): string {
  const noon = new Date(`${key}T12:00:00.000Z`);
  noon.setUTCDate(noon.getUTCDate() - 1);
  return noon.toISOString().slice(0, 10);
}

// seven booleans, Monday to Sunday. Days still to come are false: not missed,
// simply not happened yet.
export function streakWeek(
  facts: readonly StreakEvent[],
  now: Date = new Date(),
): boolean[] {
  const qualifying = new Set<EventKind>(STREAK_KINDS);
  const days = new Set<string>();

  for (const fact of facts) {
    if (!qualifying.has(fact.kind)) continue;
    const key = dayKeyParis(fact.occurredAt);
    if (key !== "") days.add(key);
  }

  const today = dayKeyParis(now);
  if (today === "") return [false, false, false, false, false, false, false];

  // getUTCDay() returns 0 for Sunday; the strip starts on Monday.
  const sinceMonday = (new Date(`${today}T12:00:00.000Z`).getUTCDay() + 6) % 7;

  let cursor = today;
  for (let index = 0; index < sinceMonday; index += 1) cursor = previousDay(cursor);

  const week: boolean[] = [];
  for (let index = 0; index < 7; index += 1) {
    week.push(days.has(cursor));
    cursor = nextDay(cursor);
  }
  return week;
}

/** the longest run of consecutive days, recounted from the facts, never stored. */
export function bestStreak(facts: readonly StreakEvent[]): number {
  const qualifying = new Set<EventKind>(STREAK_KINDS);
  const days = new Set<string>();

  for (const fact of facts) {
    if (!qualifying.has(fact.kind)) continue;
    const key = dayKeyParis(fact.occurredAt);
    if (key !== "") days.add(key);
  }

  let record = 0;
  for (const day of days) {
    // walk each run once, from its first day.
    if (days.has(previousDay(day))) continue;
    let length = 0;
    let cursor = day;
    while (days.has(cursor)) {
      length += 1;
      cursor = nextDay(cursor);
    }
    if (length > record) record = length;
  }
  return record;
}

export type ClusterMetrics = {
  /** still to take, best expectancy first. */
  members: TargetRow[];
  remaining: number;
  captures: number;
  withdrawals: number;
  setAside: number;
  /** remaining + captures + withdrawals; dismissed ones are excluded. */
  engaged: number;
  /** takes over engaged, 0 to 1. */
  hold: number;
  lootCents: number;
  offGrid: number;
  /** count per rank among the remaining, from V down to I. */
  ranks: { rank: Rank; count: number }[];
  /** the radius actually applied, in metres. */
  radiusMeters: number;
};

// replays the rule that built the cluster, since getClusters already dropped the
// taken and dismissed. A cluster's hold is LOCAL and must never be summed: a
// taken business within reach of two heads counts in both; sectors use getZoneStats.
export function measureCluster(
  cluster: TargetCluster,
  targets: readonly TargetRow[],
): ClusterMetrics {
  const byId = new Map(targets.map((target) => [target.id, target]));

  const members = cluster.targetIds
    .map((id) => byId.get(id))
    .filter((target): target is TargetRow => target !== undefined)
    .sort((a, b) => b.score.expectancyCents - a.score.expectancyCents);

  const head = byId.get(cluster.topTargetId) ?? null;
  const center = head ? { lat: head.lat, lng: head.lng } : cluster.center;
  const radiusMeters = head
    ? CLUSTER_RADIUS_METERS
    : Math.max(1, cluster.radiusMeters);

  let captures = 0;
  let withdrawals = 0;
  let setAside = 0;

  for (const target of targets) {
    if (!OUT_OF_PLAY.has(target.state)) continue;
    if (distanceMeters(center, target) > radiusMeters) continue;
    if (target.state === "taken") captures += 1;
    else if (target.state === "withdrawn") withdrawals += 1;
    else setAside += 1;
  }

  const ranks = new Map<string, { rank: Rank; count: number }>();
  let lootCents = 0;
  let offGrid = 0;

  for (const member of members) {
    const key = member.rarity.rank.key;
    const seen = ranks.get(key);
    if (seen) seen.count += 1;
    else ranks.set(key, { rank: member.rarity.rank, count: 1 });

    if (member.score.price.kind === "off-grid") offGrid += 1;
    else lootCents += member.score.expectancyCents;
  }

  const engaged = members.length + captures + withdrawals;

  return {
    members,
    remaining: members.length,
    captures,
    withdrawals,
    setAside,
    engaged,
    hold: engaged > 0 ? captures / engaged : 0,
    lootCents,
    offGrid,
    ranks: [...ranks.values()].sort((a, b) => b.rank.level - a.rank.level),
    radiusMeters,
  };
}
