"use client";

// Entry is in euros, the contract is in cents. The conversion happens on BOTH
// sides — here to display, in the action to save — and both go through a
// string, never a float. Every field carries a hint saying what the number
// commands, because a number nobody can explain will not be changed knowingly.

import { useActionState } from "react";

import { Button, Panel } from "@/components/ui";
import { Field } from "@/components/gate/Field";
import type { PriceGrid, PriceOffer } from "@/lib/types";

import { savePriceGridAction, resetPriceGridAction } from "./actions";
import { INITIAL_PRICE_GRID_STATE } from "./state";

/** 200_000 -> "2000"; 120_050 -> "1200.50". Never a float. */
function centsToEuros(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const rest = absolute % 100;
  const text =
    rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

type PriceGridField = {
  key: keyof PriceGrid;
  label: string;
  hint: string;
};

const OFFERS: PriceGridField[] = [
  {
    key: "baseCents",
    label: "Base tier",
    hint: "One page, one address, the client's photos. Also the lowest deal you would sign.",
  },
  {
    key: "fullSiteCents",
    label: "Full site",
    hint: "The default offer, and the one that sells most often. It is also the yardstick every rank is measured against.",
  },
  {
    key: "multiPageCents",
    label: "Multi-page site",
    hint: "Detailed menu, forms, booking — a structure rather than a storefront.",
  },
  {
    key: "multiAddressCents",
    label: "Multi-address site",
    hint: "Two to five addresses. The work changes in nature, not just in volume.",
  },
];

const ADJUSTMENTS: PriceGridField[] = [
  {
    key: "perExtraAddressCents",
    label: "Per address beyond the second",
    hint: "The second address is already paid for by the multi-address offer.",
  },
  {
    key: "extraAddressCapCents",
    label: "Cap on extra addresses",
    hint: "Past this, the marginal cost of one more location page tends to zero.",
  },
  {
    key: "bookingIntegrationCents",
    label: "Booking to integrate",
    hint: "The only line where integration time genuinely adds up: account, widget, trials.",
  },
  {
    key: "noPhotoCents",
    label: "No usable photo — discount",
    hint: "Entered as a positive amount and stored as a discount. Not generosity: without photos the mock-up convinces less, so a lower quote that lands beats a higher one that does not.",
  },
];

const BOUNDS: PriceGridField[] = [
  {
    key: "floorCents",
    label: "Floor",
    hint: "Below this, price stops being an argument and becomes a doubt — the buyer starts looking for what is missing.",
  },
  {
    key: "ceilingCents",
    label: "Ceiling",
    hint: "Above this the figure leaves the communication budget for the investment budget, which is not decided by the same person. Applies only to the offers ticked below.",
  },
];

const RECURRING: PriceGridField[] = [
  {
    key: "recurringBaseCents",
    label: "Monthly base",
    hint: "Hosting, domain, backups, small fixes. Deliberately low: it keeps the relationship open, it is not where the margin is.",
  },
  {
    key: "recurringPerExtraAddressCents",
    label: "Monthly, per address beyond the first",
    hint: "As many location pages to keep current.",
  },
  {
    key: "recurringCapCents",
    label: "Monthly cap",
    hint: "Above this you are no longer selling maintenance but a standing engagement, which is contracted differently.",
  },
];

const COUNTS: PriceGridField[] = [
  {
    key: "valueHorizonMonths",
    label: "Value horizon, in months",
    hint: "How many months of recurring revenue the figure on the map includes. One financial year by default.",
  },
  {
    key: "maxAddressesInGrid",
    label: "Addresses before going off-grid",
    hint: "Beyond this the decision is no longer taken by the person on the phone. A twenty-three-shop chain is not four times a six-shop chain.",
  },
  {
    key: "complexSiteMinPages",
    label: "Pages before the multi-page offer",
    hint: "The point where design takes longer than integration.",
  },
  {
    key: "fewReviewsForBase",
    label: "Reviews below which the base tier applies",
    hint: "Only fires alongside the two other conditions: one address, and no usable photo.",
  },
];

const CAPPABLE_OFFERS: { key: PriceOffer; label: string }[] = [
  { key: "base", label: "Base tier" },
  { key: "full-site", label: "Full site" },
  { key: "multi-page", label: "Multi-page site" },
  { key: "multi-address", label: "Multi-address site" },
];

export function PriceGridForm({ grid }: { grid: PriceGrid }) {
  const [state, action, inProgress] = useActionState(
    savePriceGridAction,
    INITIAL_PRICE_GRID_STATE,
  );
  const [resetState, resetAction, resetInProgress] = useActionState(
    resetPriceGridAction,
    INITIAL_PRICE_GRID_STATE,
  );

  const moneyField = (item: PriceGridField) => (
    <Field
      key={item.key}
      name={item.key}
      label={`${item.label} (€)`}
      defaultValue={centsToEuros(
        Math.abs(grid[item.key] as number),
      )}
      error={state.fields[item.key]}
      hint={item.hint}
    />
  );

  const countField = (item: PriceGridField) => (
    <Field
      key={item.key}
      name={item.key}
      label={item.label}
      defaultValue={String(grid[item.key] as number)}
      error={state.fields[item.key]}
      hint={item.hint}
    />
  );

  return (
    <>
      <form action={action} className="pricing__form">
        <Panel title="The four offers">
          <p className="t-body-s pricing__intro">
            {
              "A price is not computed, it is CHOSEN among the offers that exist and then adjusted. Change these four and every figure on the map follows, at the next read — nothing is stored."
            }
          </p>
          {OFFERS.map(moneyField)}
        </Panel>

        <Panel title="Adjustments">{ADJUSTMENTS.map(moneyField)}</Panel>

        <Panel title="Bounds">
          {BOUNDS.map(moneyField)}
          <fieldset className="pricing__offers">
            <legend className="t-label">Offers subject to the ceiling</legend>
            <p className="t-body-s">
              {
                "The ones you sell in a single conversation, to one owner, on one address. Untick an offer and it escapes the ceiling."
              }
            </p>
            {CAPPABLE_OFFERS.map((offer) => (
              <label key={offer.key} className="pricing__cell">
                <input
                  type="checkbox"
                  name="cappedOffers"
                  value={offer.key}
                  defaultChecked={grid.cappedOffers.includes(offer.key)}
                />
                <span>{offer.label}</span>
              </label>
            ))}
          </fieldset>
        </Panel>

        <Panel title="Monthly recurring">{RECURRING.map(moneyField)}</Panel>

        <Panel title="Thresholds">{COUNTS.map(countField)}</Panel>

        {state.error ? (
          <p className="t-body-s pricing__refusal" role="alert">
            {state.error}
          </p>
        ) : null}

        {state.saved ? (
          <p className="t-body-s pricing__confirm" role="status">
            {"Grid saved. Every price on the map already follows it."}
          </p>
        ) : null}

        <div className="pricing__actions">
          <Button type="submit" ton="primary" disabled={inProgress}>
            {inProgress ? "Saving…" : "Save the grid"}
          </Button>
        </div>
      </form>

      <form action={resetAction} className="pricing__reset">
        <p className="t-body-s">
          {
            "Resetting removes your grid rather than overwriting it with the defaults. The difference matters the day the product's defaults change: an account that never decided anything follows, an account that copied them by hand does not."
          }
        </p>
        <Button type="submit" ton="discret" size="compacte" disabled={resetInProgress}>
          {resetInProgress ? "Resetting…" : "Back to the default grid"}
        </Button>
        {resetState.error ? (
          <p className="t-body-s pricing__refusal" role="alert">
            {resetState.error}
          </p>
        ) : null}
      </form>
    </>
  );
}
