// Google's terms let us keep `place_id` durably and nothing else: rating, review
// count, price level, phone, website, status and hours must be ERASED after 30
// days, not merely hidden on read. `googleFetchedAt` is our own record and stays.

import "server-only";

import { and, isNotNull, lt, or, type SQL } from "drizzle-orm";

import { db, targets } from "@/lib/db";
import { GOOGLE_FRESHNESS_DAYS } from "@/lib/types";

const RETENTION_MIN_INTERVAL_MS = 3_600_000;

let lastRun = 0;

// returns the number of rows actually cleared. Idempotent.
export async function purgeStaleGoogleFacts(): Promise<number> {
  const cutoff = new Date(Date.now() - GOOGLE_FRESHNESS_DAYS * 86_400_000);

  // without this filter every run rewrites rows that are already blank and
  // inflates a count that has to stay true.
  const remaining = or(
    isNotNull(targets.ratingTenths),
    isNotNull(targets.reviewCount),
    isNotNull(targets.priceLevel),
    isNotNull(targets.phone),
    isNotNull(targets.websiteUrl),
    isNotNull(targets.businessStatus),
    isNotNull(targets.openingHours),
  ) as SQL;

  const purged = await db
    .update(targets)
    .set({
      ratingTenths: null,
      reviewCount: null,
      priceLevel: null,
      phone: null,
      websiteUrl: null,
      businessStatus: null,
      openingHours: null,
      // `updatedAt` stays untouched: the row lost information, it did not gain any.
    })
    .where(and(lt(targets.googleFetchedAt, cutoff), remaining))
    .returning({ id: targets.id });

  lastRun = Date.now();

  if (purged.length > 0) {
    console.info(`[google] ${purged.length} records purged (past 30 days)`);
  }

  return purged.length;
}

// the same work, driven by READS so the 30-day deadline is met even when nobody
// enriches anything. It must never fail the read that triggered it, and a failed
// run is not marked as done.
export async function ensureGoogleRetention(): Promise<number> {
  const now = Date.now();
  if (now - lastRun < RETENTION_MIN_INTERVAL_MS) return 0;

  try {
    return await purgeStaleGoogleFacts();
  } catch (error) {
    console.error("[google] 30-day purge failed", error);
    return 0;
  }
}
