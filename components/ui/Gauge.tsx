import { percent } from "./percent";
import { cx, type StyleVars } from "./style";

/**
 * A progress bar, continuous or segmented.
 *
 * The fill is a `scaleX`, never a `width`, and the fill-in animation is pure
 * CSS: no JavaScript, so no hydration mismatch. When both the name and the
 * value are already written out, the bar is hidden from screen readers.
 */
export type GaugeProps = {
  /** RATIO, 0 to 1. Clamped: a gauge never overflows its track. */
  value: number;
  /** Visible label on the left. */
  name?: string;
  /** Visible value on the right, already formatted. */
  valueText?: string;
  /** CSS colour of the fill. Defaults to the primary text colour. */
  tint?: string;
  thickness?: "fine" | "normale" | "epaisse";
  /** Render as blocks rather than a continuous bar. */
  segments?: number | null;
  /** Rank in a list: offsets the start by 40 ms. */
  delayIndex?: number;
  /** For screen readers when no `name` is shown. */
  label?: string;
  className?: string;
};

export function Gauge({
  value,
  name,
  valueText,
  tint,
  thickness = "normale",
  segments = null,
  delayIndex = 0,
  label,
  className,
}: GaugeProps) {
  const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  // `rate`, not `percent`: the latter is the imported formatter.
  const rate = Math.round(ratio * 100);

  // The text already says everything: the bar has nothing left to announce.
  const barMuted = Boolean(name && valueText);

  const style: StyleVars = {
    "--gauge": ratio,
    "--gauge-delay": delayIndex,
  };
  if (tint) style["--gauge-tint"] = tint;

  const aria = barMuted
    ? { "aria-hidden": true as const }
    : {
        role: "progressbar" as const,
        "aria-label": label ?? name,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": rate,
        "aria-valuetext": valueText ?? percent(rate),
      };

  const filledCount = segments ? Math.round(ratio * segments) : 0;

  return (
    <div
      className={cx(
        "gauge",
        thickness === "fine" && "gauge--thin",
        thickness === "epaisse" && "gauge--thick",
        className,
      )}
      style={style}
    >
      {(name || valueText) && (
        <div className="gauge__row">
          {name ? <span className="t-body-s gauge__name">{name}</span> : <span />}
          {valueText ? (
            <span className="t-body-s gauge__value tnum">{valueText}</span>
          ) : null}
        </div>
      )}

      {segments ? (
        <div className="gauge__segments" {...aria}>
          {Array.from({ length: segments }, (_, index) => (
            <span
              key={index}
              className="gauge__segment"
              data-filled={index < filledCount ? "yes" : "no"}
            />
          ))}
        </div>
      ) : (
        <div className="gauge__track" {...aria}>
          <span className="gauge__fill" />
        </div>
      )}
    </div>
  );
}
