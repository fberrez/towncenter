// Bench for the prospecting scoring.
//
//     npx tsx scripts/verify-scoring.mts
//
// It checks that the algorithm lands on FIVE REAL DEALS, then on two orderings:
// leads whose only site is an Instagram page must top the expectancy ranking,
// and a franchise on a group site must come last. If a change breaks this
// bench, it is the ALGORITHM that is wrong, never this file.

import { DEFAULT_PRICE_GRID } from "@/lib/priceGrid";
import { estimatePrice, explainPlaceScore, scorePlace } from "@/lib/scoring";

// The horizon comes from the price GRID, not from a scoring constant; the bench
// measures the default grid, the one a fresh account gets.
const VALUE_HORIZON_MONTHS = DEFAULT_PRICE_GRID.valueHorizonMonths;
import type {
  PlaceScore,
  ScoringContext,
  ScoringFacts,
  SiteAuditFacts,
} from "@/lib/types";

// Frozen date: company age is measured against a given day, and a bench whose
// result changes tomorrow proves nothing.
const CONTEXT: ScoringContext = { outcomeCount: 0, now: "2026-08-02T12:00:00.000Z" };

const EUR = (cents: number) => `${(cents / 100).toLocaleString("fr-FR")} €`;

/** An ordinary address: open, listed, inside the zone, and nothing else. */
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

/** An audited site in decent shape, with only the useful bits overridden. */
function goodSite(overrides: Partial<SiteAuditFacts>): SiteAuditFacts {
  return {
    issue: "site_ok",
    https: true,
    viewport: true,
    titleFilled: true,
    usablePhotos: true,
    ...overrides,
  };
}

type Check = { what: string; expected: string; got: string; ok: boolean };

type Case = {
  n: number;
  title: string;
  facts: ScoringFacts;
  expectation: string;
  check: (score: PlaceScore) => Check[];
};

const CASES: Case[] = [
  {
    n: 1,
    title:
      "Single-address restaurant, 235 reviews, 4.9, no site, phone known, named director",
    expectation: "2 000 € + 90 €/month — the quote actually used",
    facts: facts({
      openEstablishmentCount: 1,
      companyCreatedAt: "2018-04-12",
      ratingTenths: 49,
      reviewCount: 235,
      hasPhone: true,
      directorCount: 1,
      // "No site" is an audit CONCLUSION, not the absence of an audit.
      site: { issue: "no_known_site" },
      proximity: "in-zone",
    }),
    check: (score) => [
      cmp("price", EUR(200_000), EUR(score.price.priceCents)),
      cmp("recurring", EUR(9_000), EUR(score.price.recurringCents)),
      cmp("offer", "full-site", score.price.offer),
      cmp("in grid", "grid", score.price.kind),
    ],
  },
  {
    n: 2,
    title: "Complex multi-page site: six pages, contact form, several destinations",
    expectation: "3 500 € — the floor actually quoted for this kind of site",
    facts: facts({
      openEstablishmentCount: 1,
      companyCreatedAt: "2015-09-01",
      reviewCount: 96,
      hasContactForm: true,
      directorCount: 1,
      site: goodSite({ sitemapUrlCount: 6, structuredData: false }),
    }),
    check: (score) => [
      cmp("price", EUR(350_000), EUR(score.price.priceCents)),
      cmp("offer", "multi-page", score.price.offer),
      cmp("in grid", "grid", score.price.kind),
    ],
  },
  {
    n: 3,
    title:
      "Restaurant that REFUSED 2 000 € + 50 €/month — \"too expensive for a restaurant\"",
    expectation: "the same price, but a LOW probability (≤ 10 %)",
    facts: facts({
      openEstablishmentCount: 1,
      companyCreatedAt: "2004-06-01",
      ratingTenths: 42,
      reviewCount: 118,
      priceLevel: 1,
      hasContactForm: true,
      site: goodSite({ titleFilled: false, structuredData: false, sitemapUrlCount: 3 }),
      proximity: "in-zone",
    }),
    check: (score) => [
      cmp("price", EUR(200_000), EUR(score.price.priceCents)),
      cmp("recurring", EUR(9_000), EUR(score.price.recurringCents)),
      {
        what: "low probability",
        expected: "≤ 10 %",
        got: `${score.success.percent} %`,
        ok: score.success.percent <= 10,
      },
    ],
  },
  {
    n: 4,
    title: "Business with a spotless Wix site, 783 reviews, 4.9, selling online",
    expectation: "OFF GRID \"to qualify\" — certainly not 0 €",
    facts: facts({
      openEstablishmentCount: 1,
      companyCreatedAt: "2016-02-20",
      ratingTenths: 49,
      reviewCount: 783,
      priceLevel: 2,
      hasPhone: true,
      directorCount: 1,
      site: goodSite({
        tech: "Wix",
        defaultTheme: false,
        structuredData: true,
        onlineSales: true,
        sitemapUrlCount: 24,
        lastModified: "2026-05-14T09:00:00.000Z",
      }),
    }),
    check: (score) => [
      cmp("off grid", "off-grid", score.price.kind),
      cmp("reason", "to-qualify", score.price.offer),
      cmp("price", "0 €", EUR(score.price.priceCents)),
      {
        what: "readable reason",
        expected: "a written sentence",
        got: score.price.reason,
        ok: score.price.reason.length > 20,
      },
    ],
  },
  {
    n: 5,
    title:
      "Chain of 23 shops whose home page still shows the Shopify theme placeholder",
    expectation: "OFF GRID \"by quote\" — certainly not an extrapolated amount",
    facts: facts({
      openEstablishmentCount: 23,
      companyCreatedAt: "2009-11-03",
      revenueCents: 3_200_000_000,
      financesYear: 2024,
      employeeRange: "22",
      ratingTenths: 41,
      reviewCount: 1_540,
      hasPhone: true,
      site: goodSite({
        tech: "Shopify",
        defaultTheme: true,
        onlineSales: true,
        sitemapUrlCount: 310,
      }),
    }),
    check: (score) => [
      cmp("off grid", "off-grid", score.price.kind),
      cmp("reason", "by-quote", score.price.offer),
      cmp("price", "0 €", EUR(score.price.priceCents)),
      {
        what: "readable reason",
        expected: "a written sentence",
        got: score.price.reason,
        ok: score.price.reason.length > 20,
      },
    ],
  },
];

function cmp(what: string, expected: string, got: string): Check {
  return { what, expected, got, ok: expected === got };
}

type Ranked = { name: string; kind: "instagram" | "franchise" | "control"; score: PlaceScore };

const RANKING: Array<{ name: string; kind: Ranked["kind"]; facts: ScoringFacts }> = [
  {
    name: "Instagram only — 312 reviews",
    kind: "instagram",
    facts: facts({
      companyCreatedAt: "2019-05-10",
      ratingTenths: 47,
      reviewCount: 312,
      hasPhone: true,
      directorCount: 1,
      site: { issue: "no_known_site", instagramAsSite: true },
    }),
  },
  {
    name: "Instagram only — 428 reviews",
    kind: "instagram",
    facts: facts({
      companyCreatedAt: "2021-03-02",
      ratingTenths: 48,
      reviewCount: 428,
      hasPhone: true,
      directorCount: 1,
      site: { issue: "no_known_site", instagramAsSite: true },
    }),
  },
  {
    name: "Instagram only — 505 reviews",
    kind: "instagram",
    facts: facts({
      companyCreatedAt: "2020-07-18",
      ratingTenths: 49,
      reviewCount: 505,
      hasPhone: true,
      directorCount: 1,
      site: { issue: "no_known_site", instagramAsSite: true },
    }),
  },
  {
    name: "Instagram only — 648 reviews",
    kind: "instagram",
    facts: facts({
      companyCreatedAt: "2022-01-25",
      ratingTenths: 48,
      reviewCount: 648,
      hasPhone: true,
      directorCount: 1,
      site: { issue: "no_known_site", instagramAsSite: true },
    }),
  },
  {
    name: "Franchise, 4 shops, group site",
    kind: "franchise",
    facts: facts({
      openEstablishmentCount: 4,
      companyCreatedAt: "2001-03-01",
      revenueCents: 180_000_000,
      financesYear: 2024,
      reviewCount: 640,
      hasContactForm: true,
      isFranchiseGroupSite: true,
      site: goodSite({
        agencyDetected: true,
        structuredData: true,
        sitemapUrlCount: 40,
        lastModified: "2026-04-02T09:00:00.000Z",
      }),
    }),
  },
  // Two controls, so that a six-row ranking means something.
  {
    name: "Control — decent site, little footfall",
    kind: "control",
    facts: facts({
      companyCreatedAt: "2007-09-14",
      reviewCount: 88,
      hasContactForm: true,
      site: goodSite({ titleFilled: false, sitemapUrlCount: 4 }),
    }),
  },
  {
    name: "Control — default theme, 190 reviews",
    kind: "control",
    facts: facts({
      companyCreatedAt: "2017-02-01",
      reviewCount: 190,
      hasPhone: true,
      directorCount: 1,
      site: goodSite({ defaultTheme: true, titleFilled: false, sitemapUrlCount: 5 }),
    }),
  },
];

let failures = 0;

console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
console.log(`║  ${"THE FIVE REAL DEALS".padEnd(72)}║`);
console.log("╚══════════════════════════════════════════════════════════════════════════╝");

for (const testCase of CASES) {
  const score = scorePlace(testCase.facts, CONTEXT);
  const checks = testCase.check(score);
  const passed = checks.every((check) => check.ok);
  if (!passed) failures += 1;

  console.log(`\n${passed ? "✔" : "✘"} CASE ${testCase.n} — ${testCase.title}`);
  console.log(`    expected : ${testCase.expectation}`);
  for (const check of checks) {
    const mark = check.ok ? "  ok " : " FAIL";
    console.log(
      `   ${mark} ${check.what.padEnd(18)} expected ${String(check.expected).padEnd(16)} got ${check.got}`,
    );
  }
  console.log(`    got     : ${explainPlaceScore(score)}`);
  console.log(
    `    factors : ${score.success.factors.map((f) => `${f.label} ×${f.value}`).join(" | ")}`,
  );
}

console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
console.log(`║  ${"THE EXPECTANCY RANKING".padEnd(72)}║`);
console.log("╚══════════════════════════════════════════════════════════════════════════╝\n");

const ranked: Ranked[] = RANKING.map((entry) => ({
  name: entry.name,
  kind: entry.kind,
  score: scorePlace(entry.facts, CONTEXT),
})).sort((a, b) => b.score.expectancyCents - a.score.expectancyCents);

console.log(
  `${"#".padStart(2)}  ${"lead".padEnd(40)} ${"prob".padStart(6)} ${"12 months".padStart(10)} ${"expectancy".padStart(11)}`,
);
ranked.forEach((entry, index) => {
  console.log(
    `${String(index + 1).padStart(2)}  ${entry.name.padEnd(40)} ${`${entry.score.success.percent} %`.padStart(6)} ${EUR(entry.score.price.value12MonthsCents).padStart(10)} ${EUR(entry.score.expectancyCents).padStart(11)}`,
  );
});

// The four Instagram leads must take the first four places and the franchise the
// last. The ORDER is what matters, not the values: it is the only thing the call
// queue promises.
const instagramPositions = ranked
  .map((entry, index) => ({ entry, index }))
  .filter(({ entry }) => entry.kind === "instagram")
  .map(({ index }) => index);
const franchisePosition = ranked.findIndex((entry) => entry.kind === "franchise");

const instagramOnTop = instagramPositions.every((position) => position < 4);
const franchiseLast = franchisePosition === ranked.length - 1;

console.log("");
console.log(
  `${instagramOnTop ? "✔" : "✘"} the four "Instagram as a site" leads top the ranking (places ${instagramPositions.map((p) => p + 1).join(", ")})`,
);
console.log(
  `${franchiseLast ? "✔" : "✘"} the franchise on a group site comes last (place ${franchisePosition + 1} of ${ranked.length})`,
);
if (!instagramOnTop) failures += 1;
if (!franchiseLast) failures += 1;

console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
console.log(`║  ${"INVARIANTS".padEnd(72)}║`);
console.log("╚══════════════════════════════════════════════════════════════════════════╝\n");

const invariants: Array<{ what: string; ok: boolean; detail: string }> = [];

// A closed establishment does not show 2 %: it does not exist.
const closed = scorePlace(facts({ isOpen: false, reviewCount: 400 }), CONTEXT);
invariants.push({
  what: "closed establishment → 0 %, not the 2 % floor",
  ok: closed.success.percent === 0 && closed.success.probability === 0,
  detail: `${closed.success.percent} %`,
});

const hidden = scorePlace(facts({ isDiffusible: false, reviewCount: 400 }), CONTEXT);
invariants.push({
  what: "right to object exercised → 0 %",
  ok: hidden.success.percent === 0,
  detail: `${hidden.success.percent} %`,
});

// The smallest non-zero DISPLAYABLE percentage is 5: rounding a live lead down
// to 0 would make it look dead.
const dismal = scorePlace(
  facts({
    site: goodSite({ agencyDetected: true, structuredData: true }),
    isFranchiseGroupSite: true,
    companyCreatedAt: "1998-01-01",
    reviewCount: 5,
  }),
  CONTEXT,
);
invariants.push({
  what: "live but hopeless lead → 5 %, never 0 %",
  ok: dismal.success.percent === 5 && dismal.success.probability >= 0.02,
  detail: `${dismal.success.percent} % (raw ${dismal.success.probability.toFixed(4)})`,
});

// No displayed percentage carries a decimal, nor leaves [0, 85].
const allPercents = [...CASES.map((c) => scorePlace(c.facts, CONTEXT)), ...ranked.map((r) => r.score)];
invariants.push({
  what: "every percentage is an integer multiple of 5, capped at 85",
  ok: allPercents.every(
    (s) => Number.isInteger(s.success.percent) && s.success.percent % 5 === 0 && s.success.percent <= 85,
  ),
  detail: allPercents.map((s) => s.success.percent).join(", "),
});

// Every amount is an integer number of cents. A float here would be a bomb.
invariants.push({
  what: "every amount is an integer number of cents",
  ok: allPercents.every(
    (s) =>
      Number.isInteger(s.price.priceCents) &&
      Number.isInteger(s.price.recurringCents) &&
      Number.isInteger(s.price.value12MonthsCents) &&
      Number.isInteger(s.expectancyCents),
  ),
  detail: "checked on the 12 bench sheets",
});

// The twelve-month total CONTAINS the twelve months of recurring revenue. The
// target sheet states that formula in words, and no type would catch it drifting.
invariants.push({
  what: "the 12-month total does include the 12 months of recurring",
  ok: allPercents.every(
    (s) =>
      s.price.kind !== "grid" ||
      s.price.value12MonthsCents ===
        s.price.priceCents + VALUE_HORIZON_MONTHS * s.price.recurringCents,
  ),
  detail: `price + ${VALUE_HORIZON_MONTHS} × recurring, on the 12 bench sheets`,
});

// An audit never run must NOT read as "no site": that is the trap that promotes
// a shop with a spotless site sitting behind a firewall.
const neverAudited = estimatePrice(facts({ site: null }));
const noSite = scorePlace(facts({ site: { issue: "no_known_site" } }), CONTEXT);
const notAudited = scorePlace(facts({ site: null }), CONTEXT);
invariants.push({
  what: "audit never run ≠ no site",
  ok: notAudited.success.probability < noSite.success.probability,
  detail: `neutral ${(notAudited.success.probability * 100).toFixed(1)} % < no site ${(noSite.success.probability * 100).toFixed(1)} %`,
});
invariants.push({
  what: "a never-audited site is still priceable",
  ok: neverAudited.kind === "grid" && neverAudited.priceCents === 200_000,
  detail: `${neverAudited.offer} at ${EUR(neverAudited.priceCents)}`,
});

// An unreachable site must not read as the absence of a site.
const unreachable = scorePlace(facts({ site: { issue: "site_unreachable" } }), CONTEXT);
invariants.push({
  what: "unreachable site ≠ no site",
  ok: unreachable.success.probability < noSite.success.probability,
  detail: `unreachable ${(unreachable.success.probability * 100).toFixed(1)} % < no site ${(noSite.success.probability * 100).toFixed(1)} %`,
});

// The base offer exists and fires, otherwise the bottom row of the grid is dead.
const baseOffer = estimatePrice(
  facts({ reviewCount: 12, site: { issue: "site_ok", usablePhotos: false } }),
);
invariants.push({
  what: "the 1 200 € base offer fires",
  ok: baseOffer.offer === "base" && baseOffer.priceCents === 120_000,
  detail: `${baseOffer.offer} at ${EUR(baseOffer.priceCents)}`,
});

// The extra-address cap holds: 5 addresses, no more than +900 €.
const wide = estimatePrice(facts({ openEstablishmentCount: 5 }));
invariants.push({
  what: "5 addresses → 3 500 € + 900 € capped, recurring capped at 180 €",
  ok: wide.priceCents === 440_000 && wide.recurringCents === 18_000,
  detail: `${EUR(wide.priceCents)} + ${EUR(wide.recurringCents)}/month`,
});

// Calibration: below n = 30 the estimate announces itself as an opinion.
const uncalibrated = scorePlace(facts({}), { outcomeCount: 29, now: CONTEXT.now });
const calibrated = scorePlace(facts({}), { outcomeCount: 30, now: CONTEXT.now });
invariants.push({
  what: "calibrated flips exactly at n = 30",
  ok: !uncalibrated.success.calibrated && calibrated.success.calibrated,
  detail: `n=29 → ${uncalibrated.success.calibrated} · n=30 → ${calibrated.success.calibrated}`,
});
// This assertion is on the WORDING, not on the model: the threshold is checked
// above. It is the only kind of expectation in this bench that may be edited.
invariants.push({
  what: "not calibrated → the explanation says so",
  ok: explainPlaceScore(uncalibrated).includes("not calibrated (n = 29)"),
  detail: explainPlaceScore(uncalibrated),
});

for (const invariant of invariants) {
  if (!invariant.ok) failures += 1;
  console.log(
    `${invariant.ok ? "✔" : "✘"} ${invariant.what.padEnd(58)} ${invariant.detail}`,
  );
}

console.log("");
if (failures > 0) {
  console.log(`✘ ${failures} check(s) failed. Fix the ALGORITHM, not the bench.`);
  process.exitCode = 1;
} else {
  console.log("✔ Everything checks out.");
}
console.log("");
