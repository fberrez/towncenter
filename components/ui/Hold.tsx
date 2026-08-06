import { Badge } from "./badge";
import { Gauge } from "./Gauge";
import { percent } from "./percent";
import { cx } from "./style";

/**
 * A sector's hold: businesses taken over businesses surveyed.
 *
 * A sector with nothing surveyed shows "—", not "0 %": it has not been surveyed
 * yet, which is not the same as having failed there.
 */
export type HoldProps = {
  /** Businesses taken in the sector. */
  captures: number;
  /** Businesses surveyed in the sector. Zero = sector not surveyed yet. */
  surveyed: number;
  /** The sector name. Visible text. */
  sector: string;
  /** Placed at the bottom right of the map, like the permanent badge. */
  floating?: boolean;
  className?: string;
};

export function Hold({
  captures,
  surveyed,
  sector,
  floating = false,
  className,
}: HoldProps) {
  const hasSurvey = surveyed > 0;
  const ratio = hasSurvey ? Math.min(1, captures / surveyed) : 0;
  // `rate`, not `percent`: the latter is the imported formatter.
  const rate = Math.round(ratio * 100);

  return (
    // `glass` and not an opaque surface: a floating hold sits ON the map, over
    // something that moves.
    <div className={cx("hold", "glass", floating && "hold--floating", className)}>
      <Badge>Avancement</Badge>

      <span className="hold__rate tnum">
        {hasSurvey ? percent(rate) : "—"}
        <span className="sr-only">
          {hasSurvey
            ? ` avancement de ${sector}`
            : `, secteur ${sector} pas encore relevé`}
        </span>
      </span>

      <Gauge
        value={ratio}
        segments={5}
        tint="var(--text-1)"
        label={`Avancement de ${sector}`}
      />

      <span className="t-body-s hold__detail tnum">
        {hasSurvey
          ? `${captures} obtenue${captures > 1 ? "s" : ""} sur ${surveyed} relevée${surveyed > 1 ? "s" : ""}`
          : "Secteur pas encore relevé"}
      </span>
      <span className="t-body-s hold__detail">{sector}</span>
    </div>
  );
}
