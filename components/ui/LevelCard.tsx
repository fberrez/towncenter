import { TIERS, type Level } from "@/lib/game";

import { Tag } from "./Tag";
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
      <Tag>Tier</Tag>

      <div className="level__head">
        <span className={cx(titleSize, "level__tier")}>{level.label}</span>
        <span className="t-body-s level__step tnum">
          {level.level} / {TIERS.length}
        </span>
      </div>

      <Gauge
        value={level.progress}
        tint="var(--text-1)"
        label={`Tier ${level.label}: ${percent(level.progress * 100)} toward the next`}
      />

      <p className="t-body-s level__rest tnum">
        {level.xp}
        {" progress points"}
        {next && level.toNextXp !== null
          ? ` · ${level.toNextXp} more before ${next.label}`
          : " · highest tier reached"}
      </p>
    </div>
  );
}
