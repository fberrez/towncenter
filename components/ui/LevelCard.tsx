import { TIERS, type Level } from "@/lib/game";

import { Badge } from "./badge";
import { Gauge } from "./Gauge";
import { percent } from "./percent";
import { cx } from "./style";

/**
 * The tier reached and the progress toward the next one.
 *
 * Renders no button: progress points appear when a fact is recorded, never on
 * request. The bar is neutral (`--text-1`) because gold is reserved for money.
 */
export type LevelCardProps = {
  level: Level;
  variant?: "hud" | "tile";
  className?: string;
};

export function LevelCard({ level, variant = "tile", className }: LevelCardProps) {
  const next = TIERS.find((tier) => tier.level === level.level + 1) ?? null;
  const titleSize = variant === "hud" ? "t-title-3" : "t-title-1";

  return (
    <div className={cx("level", className)}>
      <Badge>Palier</Badge>

      <div className="level__head">
        <span className={cx(titleSize, "level__tier")}>{level.label}</span>
        <span className="t-body-s level__step tnum">
          {level.level} / {TIERS.length}
        </span>
      </div>

      <Gauge
        value={level.progress}
        tint="var(--text-1)"
        label={`Palier ${level.label} : ${percent(level.progress * 100)} vers le suivant`}
      />

      <p className="t-body-s level__rest tnum">
        {level.xp}
        {" points de progression"}
        {next && level.toNextXp !== null
          ? ` · encore ${level.toNextXp} avant ${next.label}`
          : " · palier maximal atteint"}
      </p>
    </div>
  );
}
