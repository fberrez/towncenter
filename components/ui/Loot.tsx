import { formatEuros, type EurosOptions } from "@/lib/format";

import { Badge } from "./badge";
import { nonBreaking } from "./percent";
import { RollingAmount } from "./RollingAmount";
import { cx } from "./style";

// amounts arrive as INTEGER CENTS, never floats. an OFF-GRID price shows no
// amount at all: `PriceEstimate` zeroes its three amounts by construction, so
// "0 €" there would be a lie. an amount that really is zero shows "0 €".
export type LootProps = {
  // `null` = unknown amount, renders "—".
  cents: number | null | undefined;
  recurringCents?: number | null;
  // is the recurring amount ALREADY inside `cents`? on a target sheet `cents`
  // is `value12MonthsCents`, so a "+ 90 €/mo" beside it would be counted twice.
  recurringIncluded?: boolean;
  size?: "hero" | "display" | "title" | "body";
  label?: string | null;
  // no amount is shown, whatever `cents` holds.
  offGrid?: boolean;
  reason?: string | null;
  ton?: "accent" | "neutral";
  rolling?: boolean;
  decimals?: EurosOptions["decimals"];
  className?: string;
};

const SIZE_CLASS: Record<NonNullable<LootProps["size"]>, string> = {
  hero: "t-hero",
  display: "t-display",
  title: "t-title-1",
  body: "t-title-3",
};

export function Loot({
  cents,
  recurringCents,
  recurringIncluded = false,
  size = "display",
  label,
  offGrid = false,
  reason,
  ton = "accent",
  rolling = false,
  decimals = "never",
  className,
}: LootProps) {
  const sizeClass = SIZE_CLASS[size];
  const unknown = cents === null || cents === undefined || !Number.isFinite(cents);

  return (
    <div
      className={cx("loot", `loot--${size}`, ton === "neutral" && "loot--neutral", className)}
    >
      {label ? <Badge>{label}</Badge> : null}

      {offGrid ? (
        <>
          <span className="loot__off-grid">Hors grille</span>
          <span className="t-body-s tone-2">
            {nonBreaking(reason ?? "Le travail dépasse l’offre par défaut : à chiffrer manuellement.")}
          </span>
        </>
      ) : unknown ? (
        <>
          <span className={cx(sizeClass, "tone-2")} aria-label="montant inconnu">
            —
          </span>
          <span className="t-body-s tone-2">{nonBreaking(reason ?? "Non chiffré")}</span>
        </>
      ) : (
        <>
          <span className={cx(sizeClass, "loot__amount", "tnum")}>
            {rolling ? (
              <RollingAmount cents={cents} decimals={decimals} />
            ) : (
              formatEuros(cents, { decimals: decimals })
            )}
          </span>
          {recurringCents !== null &&
          recurringCents !== undefined &&
          Number.isFinite(recurringCents) ? (
            <span className="t-body-s tnum">
              <span className="loot__recurring">
                {recurringIncluded ? "dont " : "+ "}
                {formatEuros(recurringCents, { decimals: "never" })}
              </span>
              <span className="loot__recurring-unit">/mois</span>
            </span>
          ) : null}
          {reason ? <span className="t-body-s tone-2">{nonBreaking(reason)}</span> : null}
        </>
      )}
    </div>
  );
}
