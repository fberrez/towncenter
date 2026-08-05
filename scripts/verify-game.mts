// Bench for the game rules.
//
//     npx tsx scripts/verify-game.mts
//
// It checks the promises a player would notice: rank follows expectancy and an
// off-grid business is never ranked at the bottom; taking a big business pays
// more than a small one while spotting pays almost nothing; the second tier is
// reached exactly at the end of one complete deal; the streak counts
// EUROPE/PARIS days, not UTC ones. If a change breaks this bench, it is the
// ALGORITHM that is wrong, never this file.

import {
  FULL_DEAL_KINDS,
  STANDARD_DEAL_CENTS,
  RANKS,
  SEASON_DAYS,
  STREAK_KINDS,
  TIERS,
  XP_BASE,
  XP_HARVEST_CAP,
  lootWeight,
  dayKeyParis,
  levelFor,
  rarityOf,
  seasonAt,
  streakFrom,
  xpFor,
  xpForSpotting,
  type StreakEvent,
} from "@/lib/game";
import { scorePlace } from "@/lib/scoring";
import type { EventKind, PlaceScore, ScoringContext, ScoringFacts } from "@/lib/types";

// Same frozen date as the scoring bench: both must speak of the same day, or a
// company age would make the two diverge.
const CONTEXT: ScoringContext = { outcomeCount: 0, now: "2026-08-02T12:00:00.000Z" };

const EUR = (cents: number) => `${(cents / 100).toLocaleString("fr-FR")} €`;

function facts(overrides: Partial<ScoringFacts>): ScoringFacts {
  return {
    openEstablishmentCount: 1,
    companyCreatedAt: null,
    revenueCents: null,
    financesYear: null,
    employeeRange: null,
    companyCategory: null,
    ratingTenths: null,
    reviewCount: null,
    priceLevel: null,
    hasPhone: false,
    hasContactForm: false,
    directorCount: 0,
    site: null,
    proximity: "in-zone",
    isOpen: true,
    isDiffusible: true,
    isFranchiseGroupSite: false,
    ...overrides,
  };
}

const score = (overrides: Partial<ScoringFacts>): PlaceScore =>
  scorePlace(facts(overrides), CONTEXT);

// Five real businesses, taken from the scoring bench.

/** Instagram as a site, 428 reviews, named director. The best of the file. */
const INSTAGRAM = score({
  companyCreatedAt: "2021-03-02",
  ratingTenths: 48,
  reviewCount: 428,
  hasPhone: true,
  directorCount: 1,
  site: { issue: "no_known_site", instagramAsSite: true },
});

/** Default theme, never modified, 190 reviews. */
const DEFAULT_THEME_CASE = score({
  companyCreatedAt: "2017-02-01",
  reviewCount: 190,
  hasPhone: true,
  directorCount: 1,
  site: {
    issue: "site_ok",
    https: true,
    viewport: true,
    usablePhotos: true,
    defaultTheme: true,
    sitemapUrlCount: 5,
  },
});

/** Decent site, little footfall, contact form only. */
const SITE_CORRECT = score({
  companyCreatedAt: "2007-09-14",
  reviewCount: 88,
  hasContactForm: true,
  site: {
    issue: "site_ok",
    https: true,
    viewport: true,
    usablePhotos: true,
    sitemapUrlCount: 4,
  },
});

/** Franchise on a group site: big value, no chance. */
const FRANCHISE = score({
  openEstablishmentCount: 4,
  companyCreatedAt: "2001-03-01",
  revenueCents: 180_000_000,
  financesYear: 2024,
  reviewCount: 640,
  hasContactForm: true,
  isFranchiseGroupSite: true,
  site: {
    issue: "site_ok",
    https: true,
    viewport: true,
    titleFilled: true,
    usablePhotos: true,
    agencyDetected: true,
    structuredData: true,
    sitemapUrlCount: 40,
    lastModified: "2026-04-02T09:00:00.000Z",
  },
});

/** Chain of 23 shops: OFF GRID, by quote. */
const CHAIN_23 = score({
  openEstablishmentCount: 23,
  companyCreatedAt: "2009-11-03",
  revenueCents: 3_200_000_000,
  financesYear: 2024,
  employeeRange: "22",
  reviewCount: 1_540,
  hasPhone: true,
  site: {
    issue: "site_ok",
    https: true,
    viewport: true,
    titleFilled: true,
    usablePhotos: true,
    tech: "Shopify",
    defaultTheme: true,
    onlineSales: true,
    sitemapUrlCount: 310,
  },
});

/** Online sales on one address: OFF GRID, to qualify. */
const ONLINE_SALES = score({
  openEstablishmentCount: 1,
  companyCreatedAt: "2016-02-20",
  ratingTenths: 49,
  reviewCount: 783,
  priceLevel: 2,
  hasPhone: true,
  directorCount: 1,
  site: {
    issue: "site_ok",
    https: true,
    viewport: true,
    titleFilled: true,
    usablePhotos: true,
    structuredData: true,
    onlineSales: true,
    sitemapUrlCount: 24,
    lastModified: "2026-05-14T09:00:00.000Z",
  },
});

type Check = { what: string; expected: string; got: string; ok: boolean };

const checks: Check[] = [];

function expect(what: string, expected: unknown, got: unknown): void {
  checks.push({
    what,
    expected: String(expected),
    got: String(got),
    ok: String(expected) === String(got),
  });
}

function assert(what: string, ok: boolean, detail: string): void {
  checks.push({ what, expected: "true", got: detail, ok });
}

function section(title: string): void {
  console.log(
    `\n╔══════════════════════════════════════════════════════════════════════════╗`,
  );
  console.log(`║  ${title.padEnd(72)}║`);
  console.log(
    `╚══════════════════════════════════════════════════════════════════════════╝`,
  );
}

// 1. RANK

section("RANK FOLLOWS EXPECTANCY");

console.log("");
console.log(`   benchmark: the default deal is worth ${EUR(STANDARD_DEAL_CENTS)} over twelve months`);
console.log("");
console.log(
  `   ${"business".padEnd(30)} ${"expectancy".padStart(11)}  ${"rank".padEnd(11)} reason`,
);

const CATALOGUE: Array<{ name: string; score: PlaceScore; establishments: number | null }> = [
  { name: "Instagram, 428 reviews", score: INSTAGRAM, establishments: 1 },
  { name: "Default theme, 190 reviews", score: DEFAULT_THEME_CASE, establishments: 1 },
  { name: "Decent site, few reviews", score: SITE_CORRECT, establishments: 1 },
  { name: "Franchise, 4 shops", score: FRANCHISE, establishments: 4 },
  { name: "Chain of 23 (off grid)", score: CHAIN_23, establishments: 23 },
  { name: "Online sales (off grid)", score: ONLINE_SALES, establishments: 1 },
];

for (const entry of CATALOGUE) {
  const rarity = rarityOf(entry.score, entry.establishments);
  console.log(
    `   ${entry.name.padEnd(30)} ${EUR(rarity.expectancyCents).padStart(11)}  ${rarity.rank.label.padEnd(11)} ${rarity.reason}`,
  );
}

const rInstagram = rarityOf(INSTAGRAM, 1);
const rTheme = rarityOf(DEFAULT_THEME_CASE, 1);
const rCorrect = rarityOf(SITE_CORRECT, 1);
const rFranchise = rarityOf(FRANCHISE, 4);
const rChain = rarityOf(CHAIN_23, 23);
const rOnlineSales = rarityOf(ONLINE_SALES, 1);

console.log("");

// Rank order follows expectancy order. That is THE promise of the rank.
assert(
  "rank is monotone with expectancy",
  rInstagram.rank.level > rTheme.rank.level &&
    rTheme.rank.level > rCorrect.rank.level &&
    rCorrect.rank.level >= rFranchise.rank.level,
  `${rInstagram.rank.label} > ${rTheme.rank.label} > ${rCorrect.rank.label} >= ${rFranchise.rank.label}`,
);

// An expensive franchise that is lost in advance must not shine on the map:
// exactly the mistake a rank based on the loot alone would make.
assert(
  "a big deal with no odds stays at rank I",
  rFranchise.rank.key === "stall" &&
    FRANCHISE.price.value12MonthsCents > INSTAGRAM.price.value12MonthsCents,
  `franchise ${EUR(FRANCHISE.price.value12MonthsCents)} over 12 months → ${rFranchise.rank.label}`,
);

// Double encoding: colour AND diameter AND ring. A colour-blind player reads size.
assert(
  "the five ranks have five strictly increasing diameters",
  RANKS.slice()
    .sort((a, b) => a.level - b.level)
    .every((rank, index, all) => index === 0 || rank.dotPx > all[index - 1]!.dotPx),
  RANKS.slice()
    .sort((a, b) => a.level - b.level)
    .map((r) => `${r.label} ${r.dotPx}px`)
    .join(" · "),
);
assert(
  "the ring appears only at ranks IV and V, the halo only at V",
  RANKS.every((r) => (r.ringPx > 0) === r.level >= 4) &&
    RANKS.every((r) => r.halo === (r.level === 5)),
  RANKS.map((r) => `${r.level}:${r.ringPx}px${r.halo ? "+halo" : ""}`).join(" "),
);

// `RANK_MEANING` in `components/ui/RarityTag.tsx` spells these fractions out in
// words ("half the standard deal", "a quarter of it", "a tenth of it") and
// cannot check them. Move a threshold and the tooltip simply starts lying, with
// no error and no type break. This is the only place that coupling is verified.
const FRACTIONS: readonly [string, number][] = [
  ["citadel", 1],
  ["stronghold", 2],
  ["townhouse", 4],
  ["counting-house", 10],
];

assert(
  "thresholds are benchmark, half, quarter, tenth — what the tooltip says",
  FRACTIONS.every(([key, divisor]) => {
    const rank = RANKS.find((candidate) => candidate.key === key)!;
    return rank.minExpectancyCents === Math.round(STANDARD_DEAL_CENTS / divisor);
  }) && RANKS.find((r) => r.key === "stall")!.minExpectancyCents === 0,
  FRACTIONS.map(([key, d]) => `${key} = benchmark/${d}`).join(" · ") + " · stall = 0",
);

// Off grid: the trap that buries the two best deals of the file.

expect("chain of 23 → flagged off grid", true, rChain.offGrid);
expect("chain of 23 → Citadel (5+ establishments)", "citadel", rChain.rank.key);
expect("online sales → flagged off grid", true, rOnlineSales.offGrid);
expect("online sales, one address → Townhouse floor", "townhouse", rOnlineSales.rank.key);
assert(
  "an off-grid target is NEVER ranked Stall",
  rChain.rank.level >= 3 && rOnlineSales.rank.level >= 3,
  `${rChain.rank.label} · ${rOnlineSales.rank.label}`,
);
assert(
  "a rank chip always carries its reason",
  CATALOGUE.every((e) => rarityOf(e.score, e.establishments).reason.length > 10),
  "the 6 bench sheets carry a sentence",
);

// 2. XP

section("XP FOLLOWS THE LOOT");

console.log("");
console.log(
  `   ${"event".padEnd(12)} ${"base".padStart(5)} ${"small (base)".padStart(15)} ${"benchmark".padStart(8)} ${"big (5 addr.)".padStart(16)} ${"off grid".padStart(12)}`,
);

const BASE_TIER = score({ reviewCount: 12, site: { issue: "site_ok", usablePhotos: false } });
const FIVE_ADDRESSES = score({ openEstablishmentCount: 5 });
const KINDS: EventKind[] = ["survey", "study", "contact", "reply", "take", "withdrawal"];

for (const kind of KINDS) {
  console.log(
    `   ${kind.padEnd(12)} ${String(XP_BASE[kind]).padStart(5)} ${String(xpFor(kind, BASE_TIER)).padStart(15)} ${String(xpFor(kind, DEFAULT_THEME_CASE)).padStart(8)} ${String(xpFor(kind, FIVE_ADDRESSES)).padStart(16)} ${String(xpFor(kind, CHAIN_23)).padStart(12)}`,
  );
}

console.log("");

expect(
  "taking is worth 100 times spotting, at equal loot",
  xpFor("survey", DEFAULT_THEME_CASE) * 100,
  xpFor("take", DEFAULT_THEME_CASE),
);
assert(
  "taking a big business pays more than a small one",
  xpFor("take", FIVE_ADDRESSES) > xpFor("take", DEFAULT_THEME_CASE) &&
    xpFor("take", DEFAULT_THEME_CASE) > xpFor("take", BASE_TIER),
  `5 addresses ${xpFor("take", FIVE_ADDRESSES)} > benchmark ${xpFor("take", DEFAULT_THEME_CASE)} > base ${xpFor("take", BASE_TIER)}`,
);
expect("the benchmark deal is worth exactly its scale", 100, xpFor("take", DEFAULT_THEME_CASE));
expect("the benchmark loot weight is 1", 1, lootWeight(DEFAULT_THEME_CASE));

// Not knowing is not penalised: same rule as in the scoring.
expect("unknown loot (off grid) → NEUTRAL weight, not the floor", 1, lootWeight(CHAIN_23));
expect("no score supplied → NEUTRAL weight", 1, lootWeight(null));
expect("off grid: taking pays the full scale", 100, xpFor("take", CHAIN_23));

assert(
  "no event is worth zero points",
  KINDS.every((kind) => xpFor(kind, BASE_TIER) >= 1 && xpFor(kind, null) >= 1),
  "the 6 event kinds all return at least 1",
);
assert(
  "every xp award is an integer",
  KINDS.every((kind) =>
    [BASE_TIER, DEFAULT_THEME_CASE, FIVE_ADDRESSES, CHAIN_23, null].every((s) =>
      Number.isInteger(xpFor(kind, s)),
    ),
  ),
  "checked on 30 combinations",
);
// A withdrawal pays: closing a dead lead is work, and a game that only rewards
// wins encourages leaving dead deals lying around.
assert(
  "a withdrawal pays something, but less than a contact",
  xpFor("withdrawal", DEFAULT_THEME_CASE) > 0 && xpFor("withdrawal", DEFAULT_THEME_CASE) < xpFor("contact", DEFAULT_THEME_CASE),
  `withdrawal ${xpFor("withdrawal", DEFAULT_THEME_CASE)} < contact ${xpFor("contact", DEFAULT_THEME_CASE)}`,
);

// Survey cap: a real sector returns hundreds of businesses, so drawing a
// rectangle and waiting must not move you up a tier.

/** Total xp for a survey of `n` businesses, cap included. */
const surveyRun = (n: number): number => {
  let total = 0;
  for (let rank = 0; rank < n; rank += 1) total += xpForSpotting(rank);
  return total;
};

console.log("");
for (const n of [10, 100, 331, 1_500]) {
  console.log(
    `   ${String(n).padStart(5)} businesses surveyed → ${String(surveyRun(n)).padStart(4)} pts  → tier ${levelFor(surveyRun(n)).level} ${levelFor(surveyRun(n)).label}`,
  );
}
console.log("");

expect("the survey cap equals one take", XP_BASE.take, XP_HARVEST_CAP);
expect("a hundred businesses are worth a hundred points", 100, surveyRun(100));
expect(
  "three hundred and thirty-one are worth no more",
  XP_HARVEST_CAP,
  surveyRun(331),
);
expect("the hard survey cap crosses nothing", XP_HARVEST_CAP, surveyRun(1_500));
assert(
  "no survey, however large, changes tier",
  levelFor(surveyRun(1_500)).level === 1,
  `1 500 businesses → ${surveyRun(1_500)} pts → tier ${levelFor(surveyRun(1_500)).level}`,
);
assert(
  "re-running a survey does not hand out the cap again",
  xpForSpotting(XP_HARVEST_CAP) === 0 && xpForSpotting(XP_HARVEST_CAP - 1) === 1,
  `at index ${XP_HARVEST_CAP - 1}: 1 pt · at index ${XP_HARVEST_CAP}: 0 pt`,
);
assert(
  "a spotting award is a non-negative integer",
  [0, 1, 99, 100, 5_000, -3, Number.NaN].every(
    (rank) => Number.isInteger(xpForSpotting(rank)) && xpForSpotting(rank) >= 0,
  ),
  "checked on 7 indices, unreadable values included",
);

// 3. LEVEL

section("LEVEL AND TIERS");

console.log("");
for (const tier of TIERS) {
  const level = levelFor(tier.floorXp);
  console.log(
    `   ${String(tier.level).padStart(2)}  ${tier.label.padEnd(14)} from ${String(tier.floorXp).padStart(6)} pts  → ${String(level.toNextXp ?? "—").padStart(6)} left before the next`,
  );
}
console.log("");

// The complete deal counts ONLY the events the product actually writes. The
// calibration lives in `FULL_DEAL_KINDS`, not in this file.
const FULL_DEAL = FULL_DEAL_KINDS.reduce(
  (sum, kind) => sum + xpFor(kind, DEFAULT_THEME_CASE),
  0,
);

console.log(`   a deal carried end to end on the benchmark is worth ${FULL_DEAL} points`);
console.log("");

expect(
  "tier 2 is reached exactly at the first complete deal",
  FULL_DEAL,
  TIERS[1]!.floorXp,
);
// These two expectations are on a LABEL, not on a threshold: the threshold is
// `FULL_DEAL`, checked just above. Every other expectation reads an ASCII key.
expect("a complete deal moves you to tier 2", "Surveyor", levelFor(FULL_DEAL).label);
expect("one point less stays at tier 1", "Scout", levelFor(FULL_DEAL - 1).label);

expect("zero points → first tier", 1, levelFor(0).level);
expect("zero points → zero progress", 0, levelFor(0).progress);
expect("negative xp does not drop a tier", 1, levelFor(-500).level);
expect("unreadable xp falls back to zero", 0, levelFor(Number.NaN).xp);

const last = TIERS.at(-1)!;
expect("at the last tier, no next", "null", String(levelFor(last.floorXp).nextXp));
expect("at the last tier, progress is full", 1, levelFor(last.floorXp + 99_999).progress);

const middle = levelFor(Math.round((TIERS[2]!.floorXp + TIERS[3]!.floorXp) / 2));
assert(
  "mid-tier, progress is one half",
  Math.abs(middle.progress - 0.5) < 0.01,
  `${(middle.progress * 100).toFixed(1)} % of ${middle.label} towards the next tier`,
);
assert(
  "tiers are strictly increasing",
  TIERS.every((tier, i) => i === 0 || tier.floorXp > TIERS[i - 1]!.floorXp),
  TIERS.map((t) => t.floorXp).join(" < "),
);

// 4. STREAK

section("THE STREAK COUNTS EUROPE/PARIS DAYS");

console.log("");

const ev = (iso: string, kind: EventKind = "contact"): StreakEvent => ({
  kind,
  occurredAt: new Date(iso),
});

// Reference: 3 August 2026 at 10:00 Paris time (08:00 UTC in summer).
const NOW = new Date("2026-08-03T08:00:00.000Z");

expect("the Europe/Paris day is read correctly", "2026-08-03", dayKeyParis(NOW));

// TIMEZONE TRAP. A call made on 3 August at 00:30 in Paris carries the UTC
// timestamp of 2 August at 22:30. Counted in UTC it would break the streak.
expect(
  "00:30 in Paris belongs to the day the call was made",
  "2026-08-03",
  dayKeyParis(new Date("2026-08-02T22:30:00.000Z")),
);
expect(
  "23:30 in Paris still belongs to that same day",
  "2026-08-02",
  dayKeyParis(new Date("2026-08-02T21:30:00.000Z")),
);

const late = streakFrom(
  [ev("2026-08-02T22:30:00.000Z"), ev("2026-08-01T22:30:00.000Z")],
  NOW,
);
expect("two night calls → 2 streak days, not 1", 2, late.days);

// Three days in a row, today included.
const threeDays = streakFrom(
  [
    ev("2026-08-03T07:00:00.000Z"),
    ev("2026-08-02T09:00:00.000Z"),
    ev("2026-08-01T09:00:00.000Z"),
  ],
  NOW,
);
expect("three consecutive days", 3, threeDays.days);
expect("an event logged today", true, threeDays.aliveToday);
expect("nothing to flag", false, threeDays.atRisk);

// Several events on the same day count once.
const sameDay = streakFrom(
  [
    ev("2026-08-03T06:00:00.000Z"),
    ev("2026-08-03T07:00:00.000Z"),
    ev("2026-08-03T07:30:00.000Z"),
  ],
  NOW,
);
expect("five calls on the same day are not five days", 1, sameDay.days);

// Nothing today, but something yesterday: the day is not over.
const yesterdayOnly = streakFrom(
  [ev("2026-08-02T09:00:00.000Z"), ev("2026-08-01T09:00:00.000Z")],
  NOW,
);
expect("yesterday's streak still holds this morning", 2, yesterdayOnly.days);
expect("it is flagged at risk", true, yesterdayOnly.atRisk);
expect("and not yet alive today", false, yesterdayOnly.aliveToday);

// One full empty day: the streak falls.
const broken = streakFrom(
  [ev("2026-08-01T09:00:00.000Z"), ev("2026-07-31T09:00:00.000Z")],
  NOW,
);
expect("one full empty day breaks the streak", 0, broken.days);
expect("but the date of the last event is kept", "2026-08-01", String(broken.lastDay));

// A gap in the middle: only the most recent run counts.
const gap = streakFrom(
  [
    ev("2026-08-03T07:00:00.000Z"),
    ev("2026-08-02T09:00:00.000Z"),
    ev("2026-07-28T09:00:00.000Z"),
    ev("2026-07-27T09:00:00.000Z"),
  ],
  NOW,
);
expect("a gap in the middle is not filled", 2, gap.days);

// The switch to winter time must neither create nor eat a day.
const dstChange = streakFrom(
  [
    ev("2026-10-26T09:00:00.000Z"),
    ev("2026-10-25T09:00:00.000Z"),
    ev("2026-10-24T09:00:00.000Z"),
  ],
  new Date("2026-10-26T09:30:00.000Z"),
);
expect("the switch to winter time does not eat a day", 3, dstChange.days);

// Only qualifying events hold the streak.
const singleDay = streakFrom(
  [ev("2026-08-03T07:00:00.000Z", "survey"), ev("2026-08-02T09:00:00.000Z", "study")],
  NOW,
);
expect("surveying a sector does not hold the streak", 0, singleDay.days);
const signature = streakFrom([ev("2026-08-03T07:00:00.000Z", "take")], NOW);
expect("a take holds the streak", 1, signature.days);
const replied = streakFrom([ev("2026-08-03T07:00:00.000Z", "reply")], NOW);
expect("an inbound reply does not hold the streak", 0, replied.days);

expect("no event → empty streak", 0, streakFrom([], NOW).days);
expect("no event → no date", "null", String(streakFrom([], NOW).lastDay));
console.log("");
console.log(`   events that hold the streak: ${STREAK_KINDS.join(", ")}`);

// 5. SEASON

section("THE SEASON");

const season = seasonAt(NOW);
console.log("");
console.log(
  `   from ${season.startsAt.toISOString().slice(0, 10)} to ${season.endsAt.toISOString().slice(0, 10)} — ${season.daysLeft} days left`,
);
console.log("");

expect("a season lasts 30 days", SEASON_DAYS, 30);
expect(
  "the window really is 30 days",
  30,
  Math.round((season.endsAt.getTime() - season.startsAt.getTime()) / 86_400_000),
);
assert(
  "the current instant is inside the window",
  season.startsAt <= NOW && NOW < season.endsAt,
  `${season.startsAt.toISOString()} <= now < ${season.endsAt.toISOString()}`,
);
assert(
  "between 1 and 30 days remain",
  season.daysLeft >= 1 && season.daysLeft <= 30,
  `${season.daysLeft} days`,
);
assert(
  "two instants on the same day give the same season",
  seasonAt(new Date("2026-08-03T23:00:00.000Z")).startsAt.getTime() ===
    season.startsAt.getTime(),
  season.startsAt.toISOString(),
);

section("VERDICT");
console.log("");

let failures = 0;
for (const check of checks) {
  if (!check.ok) failures += 1;
  const mark = check.ok ? "✔" : "✘";
  const detail = check.ok ? check.got : `expected ${check.expected}, got ${check.got}`;
  console.log(`${mark} ${check.what.padEnd(58)} ${detail}`);
}

console.log("");
if (failures > 0) {
  console.log(`✘ ${failures} check(s) failed. Fix the RULES, not the bench.`);
  process.exitCode = 1;
} else {
  console.log(`✔ Everything checks out. ${checks.length} checks.`);
}
console.log("");
