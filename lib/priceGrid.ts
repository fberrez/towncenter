// The default price grid. A grid is DATA, not a constant: each account may hold
// its own, and it reaches the pure scoring through `ScoringContext`. A missing
// `price_grids` row is the normal case for a fresh account, which runs on this
// default. Every amount is in whole cents, never a float.

import { z } from "zod";

import type { PriceGrid, PriceOffer } from "@/lib/types";

export const DEFAULT_PRICE_GRID: PriceGrid = {
  baseCents: 120_000, // 1 200 EUR: one page, one address, the client's own photos
  fullSiteCents: 200_000, // 2 000 EUR: the full site, the default offer
  multiPageCents: 350_000, // 3 500 EUR: multi-page site, detailed map, form, booking
  multiAddressCents: 350_000, // 3 500 EUR: two to five addresses

  perExtraAddressCents: 30_000, // +300 EUR per address past the second
  extraAddressCapCents: 90_000, // +900 EUR at most under this heading
  bookingIntegrationCents: 50_000, // +500 EUR to wire booking or order taking
  noPhotoCents: -30_000, // -300 EUR: the only amount allowed to be negative

  floorCents: 120_000, // quote floor
  ceilingCents: 300_000, // quote ceiling, applied only to `cappedOffers`
  cappedOffers: ["base", "full-site"],

  recurringBaseCents: 9_000, // 90 EUR/month: hosting, domain, backups, small edits
  recurringPerExtraAddressCents: 3_000, // +30 EUR/month per address past the first
  recurringCapCents: 18_000, // 180 EUR/month at most
  valueHorizonMonths: 12, // months of recurring folded into the value shown on the map

  maxAddressesInGrid: 5, // past this the deal leaves the grid; it is not a 0 EUR deal
  complexSiteMinPages: 6, // from this page count, the multi-page offer applies
  fewReviewsForBase: 40, // below this review count, only the base tier is defensible
};

// A grid is the user's call, not the product's. The only bars are the ones
// without which the arithmetic stops being exact: whole cents, not negative,
// and small enough that `price + horizon * recurring` stays a safe integer.
const CENTS_LIMIT = 1_000_000_000_000;

const cents = z
  .number()
  .int("Amounts are in whole cents — no decimals.")
  .min(0, "An amount cannot be negative.")
  .max(CENTS_LIMIT);

const count = z
  .number()
  .int("Whole numbers only.")
  .min(0, "This cannot be negative.")
  .max(CENTS_LIMIT);

const CAPPABLE_OFFERS = [
  "base",
  "full-site",
  "multi-page",
  "multi-address",
] as const satisfies readonly PriceOffer[];

// a grid also arrives from a database row and from a form; both cross this schema.
export const PRICE_GRID_SCHEMA = z
  .object({
    baseCents: cents,
    fullSiteCents: cents,
    multiPageCents: cents,
    multiAddressCents: cents,

    perExtraAddressCents: cents,
    extraAddressCapCents: cents,
    bookingIntegrationCents: cents,
    noPhotoCents: z
      .number()
      .int()
      .min(-CENTS_LIMIT)
      .max(0, "A discount is stored as zero or less."),

    floorCents: cents,
    ceilingCents: cents,
    cappedOffers: z.array(z.enum(CAPPABLE_OFFERS)),

    recurringBaseCents: cents,
    recurringPerExtraAddressCents: cents,
    recurringCapCents: cents,
    valueHorizonMonths: count,

    maxAddressesInGrid: count,
    complexSiteMinPages: count,
    fewReviewsForBase: count,
  });

// a damaged row falls back to the default rather than making prices disappear.
export function readPriceGrid(value: unknown): PriceGrid {
  const parsed = PRICE_GRID_SCHEMA.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_PRICE_GRID;
}

// the value of a full site plus a year of hosting: what "a normal deal" is
// worth under this grid. Measured against another grid, an account selling
// higher would see every target read as small.
export function standardDealCents(grid: PriceGrid = DEFAULT_PRICE_GRID): number {
  return grid.fullSiteCents + grid.valueHorizonMonths * grid.recurringBaseCents;
}
