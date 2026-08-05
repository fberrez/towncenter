// The price grid screen. It shows the effect before asking for the change: a
// witness business is scored under the current grid, just above the form.

import type { Route } from "next";
import Link from "next/link";

import { Loot, Tag, Panel, RarityTag } from "@/components/ui";
import { requireUser } from "@/lib/accounts";
import { rarityOf } from "@/lib/game";
import { DEFAULT_PRICE_GRID } from "@/lib/priceGrid";
import { explainPrice, scorePlace } from "@/lib/scoring";
import type { ScoringFacts } from "@/lib/types";

import { getPriceGrid } from "../queries";
import { PriceGridForm } from "./PriceGridForm";

import "./pricing.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pricing · Towncenter",
};

// An invented business, and it must stay invented: this screen has to give the
// SAME result for everyone, otherwise two people comparing grids would in fact
// be comparing two businesses. These facts trigger the default offer, the one
// every rank is measured against.
const SAMPLE: ScoringFacts = {
  openEstablishmentCount: 1,
  companyCreatedAt: null,
  revenueCents: null,
  financesYear: null,
  employeeRange: null,
  companyCategory: null,
  ratingTenths: 49,
  reviewCount: 235,
  priceLevel: null,
  hasPhone: true,
  hasContactForm: false,
  directorCount: 1,
  site: { issue: "no_known_site" },
  proximity: "in-zone",
  isOpen: true,
  isDiffusible: true,
  isFranchiseGroupSite: false,
};

export default async function PricingPage() {
  const owner = await requireUser();
  const grid = await getPriceGrid(owner);

  const custom = grid !== DEFAULT_PRICE_GRID;

  // scored TWICE, under the account's grid and under the default one: showing
  // both is what makes the difference readable
  const context = { outcomeCount: 0, grid: grid };
  const score = scorePlace(SAMPLE, context);
  const defaultScore = scorePlace(SAMPLE, {
    outcomeCount: 0,
    grid: DEFAULT_PRICE_GRID,
  });

  return (
    <main className="pricing">
      <header className="pricing__head">
        <Tag as="h2">Pricing</Tag>
        <p className="t-body">
          {
            "Your price grid. Every amount the map shows comes from here — the loot on a target, the treasure of a sector, the rank of a business, and the progress a deal is worth. Nothing is stored: the score is recomputed on every read, so a change here applies everywhere at once."
          }
        </p>
        <Link className="t-body-s" href={"/" as Route}>
          {"Back to the map"}
        </Link>
      </header>

      <Panel title="What the grid does to a witness">
        <p className="t-body-s">
          {
            "One address, 235 reviews, no website, phone known — the facts that trigger your default offer. Invented on purpose: this witness must read the same for everyone, otherwise two people comparing grids would in fact be comparing two businesses."
          }
        </p>

        <dl className="pricing__sample">
          <div>
            <dt className="t-label">Your grid</dt>
            <dd>
              <Loot cents={score.price.value12MonthsCents} />
              <RarityTag rarity={rarityOf(score, SAMPLE.openEstablishmentCount, grid)} />
              <p className="t-body-s">{explainPrice(score.price)}</p>
            </dd>
          </div>

          {custom ? (
            <div>
              <dt className="t-label">The default grid</dt>
              <dd>
                <Loot cents={defaultScore.price.value12MonthsCents} />
                <p className="t-body-s">{explainPrice(defaultScore.price)}</p>
              </dd>
            </div>
          ) : null}
        </dl>

        {custom ? null : (
          <p className="t-body-s">
            {
              "You are on the default grid — the prices the product ships with, which are one person's real rates. They are a starting point, not a recommendation."
            }
          </p>
        )}
      </Panel>

      <PriceGridForm grid={grid} />
    </main>
  );
}
