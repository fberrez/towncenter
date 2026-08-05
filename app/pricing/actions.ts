"use server";

// requireUser() runs on the first line of every action: a Server Action is a
// directly reachable HTTP endpoint, and the page being protected does not
// protect it.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/accounts";
import { db, priceGrids } from "@/lib/db";

import { readGridForm } from "./form";
import type { PriceGridState } from "./state";

export async function savePriceGridAction(
  _previous: PriceGridState,
  formData: FormData,
): Promise<PriceGridState> {
  const owner = await requireUser();

  const { grid, fields } = readGridForm(formData);
  if (grid === null) {
    return { error: null, fields, saved: false };
  }

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
