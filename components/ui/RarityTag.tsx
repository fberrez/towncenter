import { STANDARD_DEAL_CENTS, RANKS, type Rank, type RankKey, type Rarity } from "@/lib/game";
import { formatEuros } from "@/lib/format";
import { MIN_SECTOR_SIZE_FOR_SHARE } from "@/lib/limits";

import { nonBreaking, percent } from "./percent";
import { cx, type StyleVars } from "./style";

// the rank rides four channels (colour, diameter, ring, halo) so it reads
// without colour vision. the sizes come from `lib/game.ts`, never copied here.
export type RankDotProps = {
  rank: Rank;
  aligned?: boolean;
  className?: string;
};

export function RankDot({ rank, aligned = false, className }: RankDotProps) {
  const style: StyleVars = {
    "--dot-size": `${rank.dotPx}px`,
  };
  if (rank.ringPx > 0) {
    style["--dot-ring"] = `0 0 0 ${rank.ringPx}px var(--rank-color)`;
  }

  const point = (
    <span
      className={cx("dot", rank.halo && "dot--halo", !aligned && className)}
      style={style}
      // colour and size are decorative: the rank name is written next to it.
      aria-hidden="true"
    />
  );

  if (!aligned) return point;
  return <span className={cx("dot-box", className)}>{point}</span>;
}

// the rank name renders in `--text-1`, never in the rank colour: the rank
// colours sit between 3.6:1 and 4.2:1 on their own veil, below AA at 10 px.
export type RarityTagProps = {
  rarity: Rarity;
  variant?: "chip" | "map";
  sector?: { sameRank: number; surveyed: number } | null;
  explained?: boolean;
  className?: string;
};

export function RarityTag({
  rarity,
  variant = "chip",
  sector = null,
  explained = false,
  className,
}: RarityTagProps) {
  const { rank, reason, offGrid } = rarity;

  // under `MIN_SECTOR_SIZE_FOR_SHARE` surveyed businesses the sample is too
  // thin for a percentage: only the raw count is shown.
  const part =
    sector && sector.surveyed >= MIN_SECTOR_SIZE_FOR_SHARE
      ? `${sector.sameRank} of ${sector.surveyed} · ${percent((sector.sameRank / sector.surveyed) * 100)} of the sector`
      : sector
        ? `${sector.sameRank} of ${sector.surveyed} surveyed`
        : null;

  return (
    <span
      className={cx("rarity", variant === "map" && "rarity--card", className)}
      data-rank={rank.level}
      data-off-grid={offGrid ? "yes" : "no"}
    >
      <RankDot rank={rank} aligned />
      <span className="rarity__texts">
        <span className={cx(variant === "map" ? "t-label" : "t-micro", "rarity__name")}>
          {rank.label}
          <span className="sr-only">{`, rank ${rank.level} of 5`}</span>
          {explained ? <RankScale rarity={rarity} /> : null}
        </span>
        {/* `reason` arrives from `lib/game` with ordinary spaces. */}
        <span className="t-body-s rarity__reason">{nonBreaking(reason)}</span>
        {part ? <span className="t-body-s rarity__reason">{part}</span> : null}
      </span>
    </span>
  );
}

// each meaning is a FRACTION of the standard deal, and the ratios live in
// `RANKS` (`lib/game.ts`): move one there and these sentences start lying.
const RANK_MEANING: Record<RankKey, string> = {
  citadel: "The standard deal expected in full.",
  stronghold: "Half the standard deal.",
  townhouse: "A quarter of it.",
  "counting-house": "A tenth of it.",
  stall: "Below a tenth. Most of any sector sits here.",
};

// `RANKS` runs largest first; a scale reads upwards.
const SCALE = [...RANKS].reverse();

function amount(cents: number): string {
  return formatEuros(cents, { decimals: "never" });
}

// no state here: it would force `"use client"` on a server-rendered primitive.
// hover, focus and touch open the bubble from CSS alone.
// the bands are EQUAL WIDTH, not to the euro scale: on a linear axis four of
// the five thresholds collapse into the first sixth of the bar.
function RankScale({ rarity }: { rarity: Rarity }) {
  const { rank, expectancyCents, offGrid } = rarity;

  // null at the top rank, and off-grid where the expectancy is zero.
  const next = SCALE[SCALE.findIndex((step) => step.key === rank.key) + 1] ?? null;
  const rest =
    next && !offGrid ? Math.max(0, next.minExpectancyCents - expectancyCents) : null;

  return (
    <span className="scale">
      <button
        type="button"
        className="scale__trigger"
        aria-label={`What ${rank.label} means`}
      >
        <span aria-hidden="true">i</span>
      </button>

      {/* `tooltip` and not `dialog`: a dialog would trap focus in a bubble
          meant to close on its own. */}
      <span className="scale__bubble" role="tooltip">
        <span className="t-label tone-2 scale__title">The five ranks</span>
        <span className="t-body-s scale__intro">
          A rank is a threshold in <strong>expected euros</strong> — the odds multiplied
          by the spoils. Nothing else goes into it. The standard deal is{" "}
          {amount(STANDARD_DEAL_CENTS)}.
        </span>

        <span className="scale__gauge" aria-hidden="true">
          {SCALE.map((step) => (
            <span
              key={step.key}
              className="scale__band"
              data-current={step.key === rank.key ? "yes" : "no"}
              style={{ "--rank-color": `var(${step.colorVar})` } as StyleVars}
            />
          ))}
        </span>

        <span className="scale__steps">
          {SCALE.map((step) => (
            <span
              key={step.key}
              className="scale__step"
              data-current={step.key === rank.key ? "yes" : "no"}
              style={{ "--rank-color": `var(${step.colorVar})` } as StyleVars}
            >
              <RankDot rank={step} aligned />
              <span className="scale__step-texts">
                <span className="t-body scale__step-name">
                  {step.label}
                  {step.key === rank.key ? (
                    <span className="scale__here"> · this one</span>
                  ) : null}
                </span>
                <span className="t-body-s scale__step-meaning">
                  {step.minExpectancyCents > 0
                    ? `${amount(step.minExpectancyCents)} and up — `
                    : "Under the tenth — "}
                  {RANK_MEANING[step.key]}
                </span>
              </span>
            </span>
          ))}
        </span>

        <span className="t-body-s scale__where">
          {offGrid ? (
            <>
              <strong>Off-grid.</strong> No expectancy to place on this scale — there is
              no price to multiply. The rank comes from the number of open
              establishments instead, and the work is priced by hand after a visit.
            </>
          ) : (
            <>
              This one expects <strong>{amount(expectancyCents)}</strong>.
              {rest !== null && rest > 0 && next
                ? ` ${amount(rest)} more would reach ${next.label}.`
                : next === null
                  ? " Nothing sits above it."
                  : ` It just reached ${rank.label}.`}
            </>
          )}
        </span>
      </span>
    </span>
  );
}
