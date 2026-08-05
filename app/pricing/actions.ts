"use server";

// Saving a price grid. requireUser() runs on the first line of every action: a
// Server Action is a directly reachable HTTP endpoint, and the page being
// protected does not protect it.
//
// Entry is in euros, storage is in integer cents, and the conversion NEVER goes
// through a float: parseFloat("1200.10") * 100 is 120010.00000000001, and
// PRICE_GRID_SCHEMA rejects non-integer cents.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/accounts";
import { db, priceGrids } from "@/lib/db";
import { PRICE_GRID_SCHEMA } from "@/lib/priceGrid";
import type { PriceGrid, PriceOffer } from "@/lib/types";

// a "use server" module may export only async functions, so the state type
// lives next door in state.ts
import type { PriceGridState } from "./state";

/** The four offers the ceiling can apply to. ASCII keys, not labels. */
const CAPPABLE_OFFERS: readonly PriceOffer[] = [
  "base",
  "full-site",
  "multi-page",
  "multi-address",
];

/** Grid fields entered in EUROS and converted to cents. */
const EURO_FIELDS = [
  "baseCents",
  "fullSiteCents",
  "multiPageCents",
  "multiAddressCents",
  "perExtraAddressCents",
  "extraAddressCapCents",
  "bookingIntegrationCents",
  "floorCents",
  "ceilingCents",
  "recurringBaseCents",
  "recurringPerExtraAddressCents",
  "recurringCapCents",
] as const;

/** Fields that are counts, not money: neither euros nor cents. */
const COUNT_FIELDS = [
  "valueHorizonMonths",
  "maxAddressesInGrid",
  "complexSiteMinPages",
  "fewReviewsForBase",
] as const;

/**
 * "1 200", "1200,50", "1 200.50" -> INTEGER cents; null when unreadable. No
 * float is involved: the whole part and the cents are two integers combined by
 * a multiply and an add, which is the only exact way.
 */
function eurosToCents(input: string): number | null {
  const cleaned = input.replace(/[\s  ]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const [whole = "0", decimals = ""] = cleaned.replace("-", "").split(".");
  const cents =
    Number(whole) * 100 + Number(decimals.padEnd(2, "0") || "0");

  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function savePriceGridAction(
  _previous: PriceGridState,
  formData: FormData,
): Promise<PriceGridState> {
  const owner = await requireUser();

  const fields: Record<string, string> = {};
  const raw: Record<string, unknown> = {};

  for (const key of EURO_FIELDS) {
    const cents = eurosToCents(text(formData, key));
    if (cents === null) {
      fields[key] = "Enter an amount in euros, e.g. 2000 or 2000.50.";
      continue;
    }
    raw[key] = cents;
  }

  for (const key of COUNT_FIELDS) {
    const value = text(formData, key);
    if (!/^\d+$/.test(value)) {
      fields[key] = "Enter a whole number.";
      continue;
    }
    raw[key] = Number(value);
  }

  // The "no usable photo" discount is ENTERED positive and STORED negative:
  // asking someone to type "-300" for a 300 EUR discount invites a sign error,
  // and a flipped sign raises the quote instead of lowering it, invisibly.
  const discount = eurosToCents(text(formData, "noPhotoCents"));
  if (discount === null || discount < 0) {
    fields.noPhotoCents = "Enter the discount as a positive amount.";
  } else {
    raw.noPhotoCents = -discount;
  }

  raw.cappedOffers = formData
    .getAll("cappedOffers")
    .filter((value): value is string => typeof value === "string")
    .filter((value): value is PriceOffer =>
      CAPPABLE_OFFERS.includes(value as PriceOffer),
    );

  if (Object.keys(fields).length > 0) {
    return { error: null, fields, saved: false };
  }

  // the SAME validation as the read: a form validating differently would let in
  // grids readPriceGrid() then silently rejects, falling back to default prices
  const parsed = PRICE_GRID_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    const byField: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_");
      if (!(key in byField)) byField[key] = issue.message;
    }
    return { error: null, fields: byField, saved: false };
  }

  const grid: PriceGrid = parsed.data;

  try {
    await db
      .insert(priceGrids)
      .values({ ownerId: owner.id, grid: grid })
      .onConflictDoUpdate({
        target: priceGrids.ownerId,
        set: { grid: grid, updatedAt: new Date() },
      });
  } catch (error) {
    console.error("[grid]", error);
    return { error: "Grid not saved. Try again.", fields: {}, saved: false };
  }

  // prices are recomputed ON READ, so clearing the cache of the screens that
  // show them applies the new grid everywhere without touching a `targets` row
  revalidatePath("/");
  revalidatePath("/progression");
  revalidatePath("/pricing");

  return { error: null, fields: {}, saved: true };
}

/**
 * Deletes the account's row so it falls back to DEFAULT_PRICE_GRID.
 *
 * The row is ERASED rather than overwritten with the defaults. The difference
 * matters the day the product's defaults change: an account that never decided
 * anything should follow, an account that copied them by hand made a choice.
 */
export async function resetPriceGridAction(
  _previous: PriceGridState,
  _formData: FormData,
): Promise<PriceGridState> {
  const owner = await requireUser();

  try {
    await db.delete(priceGrids).where(eq(priceGrids.ownerId, owner.id));
  } catch (error) {
    console.error("[grid:reset]", error);
    return { error: "Grid not reset. Try again.", fields: {}, saved: false };
  }

  revalidatePath("/");
  revalidatePath("/progression");
  revalidatePath("/pricing");

  return { error: null, fields: {}, saved: true };
}
