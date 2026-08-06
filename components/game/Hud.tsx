"use client";

// the game bar above the map. a client component because the first metric
// recomputes as the map pans; the rest comes from the server. "Taken" (logged)
// sits next to "In play" (estimated) so a drift between them stays visible.

import Link from "next/link";
import type { ReactNode } from "react";

import type { Progression, TargetRow } from "@/app/queries";
import type { Account } from "@/lib/accounts";
import { ThemeToggle, Badge, Gauge, RollingAmount, percent } from "@/components/ui";
import { AccountRail } from "@/components/gate/Account";
import { formatEuros } from "@/lib/format";

import styles from "./game.module.css";
import { lootInView, type ModelHonesty } from "./metrics";

// the rail is 56 px and must not grow, so the `Loot` primitive is not reused
// here: it stacks four lines. provenance goes inline, next to the amount.

type MetricProps = {
  /** visible text. uppercased by the design system. */
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  /** gold is reserved for money and for the primary button, nothing else. */
  gold?: boolean;
  gauge?: ReactNode;
};

function Metric({ label, value, detail, gold = false, gauge }: MetricProps) {
  return (
    <div className={styles.metric}>
      <Badge>{label}</Badge>
      <div className={styles.metric__row}>
        <span
          className={`t-title-2 tnum ${styles.metric__value} ${gold ? styles["metric__value--accent"] : ""}`}
        >
          {value}
        </span>
        {detail ? (
          <span className={`t-body-s ${styles.metric__detail}`}>{detail}</span>
        ) : null}
      </div>
      {gauge ? <div className={styles.metric__gauge}>{gauge}</div> : null}
    </div>
  );
}

export type HudProps = {
  /** null = no map on screen: the metric is dropped, never shown as a zero. */
  targets?: readonly TargetRow[] | null;
  /** frame read cut short by its ceiling: spoils in reach are then a floor. */
  truncated?: boolean;
  progression: Progression;
  /** cents actually signed, from the log. */
  bankedCents: number;
  /** null when the caller does not know: no "0 takes" is invented. */
  bankedCaptures?: number | null;
  /** the period `bankedCents` covers. no default: unlabelled reads as all-time. */
  bankedDetail?: string;
  /** cents. expectancy of what is still in play, whole territory. */
  inPlayCents: number;
  inPlayCount?: number | null;
  model?: ModelHonesty | null;
  ground?: string | null;
  /** ASCII key, not a label. */
  page?: "map" | "progression";
  account: Account;
  className?: string;
};

export function Hud({
  targets,
  truncated = false,
  progression,
  bankedCents,
  bankedCaptures = null,
  bankedDetail,
  inPlayCents,
  inPlayCount = null,
  model = null,
  ground = null,
  page = "map",
  className,
  account,
}: HudProps) {
  const scope = targets ? lootInView(targets) : null;
  const { level, streak } = progression;

  // the rail is global where the season report's first tile is seasonal.
  const bankedSource =
    bankedDetail ??
    (bankedCaptures === null
      ? "actually signed"
      : bankedCaptures === 0
        ? "nothing signed yet"
        : `signed · ${bankedCaptures} take${bankedCaptures > 1 ? "s" : ""} · all seasons`);

  return (
    <header
      className={[styles.rail, className].filter(Boolean).join(" ")}
      aria-label="Game rail"
    >
      <div className={styles.rail__brand}>
        <span className={`t-label ${styles.rail__name}`}>Towncenter</span>
        {ground ? (
          <span className={`t-body-s ${styles.rail__ground}`}>{ground}</span>
        ) : null}
      </div>

      <div className={styles.rail__metrics}>
        {scope ? (
          <Metric
            label="Spoils in reach"
            gold
            // the roll only plays on a CHANGE: a page load places the counter.
            value={<RollingAmount cents={scope.cents} />}
            detail={
              <>
                {truncated ? "at least · " : ""}
                {scope.toTake} to take
                {scope.offGrid > 0 ? ` · ${scope.offGrid} off-grid` : ""}
              </>
            }
          />
        ) : null}

        <Metric
          label="Tier"
          value={level.label}
          detail={
            level.toNextXp === null
              ? `${level.xp} pts · highest tier`
              : `${level.xp} pts · ${level.toNextXp} to the next`
          }
          gauge={
            <Gauge
              value={level.progress}
              tint="var(--text-1)"
              thickness="fine"
              label={`Tier ${level.label}: ${percent(level.progress * 100)} toward the next`}
            />
          }
        />

        <Metric
          label="Streak"
          value={`${streak.days} d`}
          detail={
            streak.days === 0
              ? "none running"
              : streak.aliveToday
                ? "held today"
                : "holds until tonight"
          }
        />

        <Metric
          label="Taken"
          gold
          value={formatEuros(bankedCents, { decimals: "never" })}
          detail={bankedSource}
        />

        <Metric
          label="In play"
          value={formatEuros(inPlayCents, { decimals: "never" })}
          detail={
            inPlayCount === null
              ? "estimated"
              : `estimated · ${inPlayCount} business${inPlayCount > 1 ? "es" : ""}`
          }
        />

        {/* no season metric: a sixth column pushes the rail past 1440 px. */}

        {model ? (
          <Metric
            label="Model"
            value={model.met === null ? "—" : percent(model.met * 100)}
            detail={
              model.met === null
                ? "no take priced yet"
                : model.calibrated
                  ? `signed / announced · n = ${model.issues}`
                  : `not calibrated · n = ${model.issues}`
            }
          />
        ) : null}
      </div>

      <div className={styles.rail__end}>
        <Link
          className={`t-body-s ${styles.rail__link}`}
          href={page === "progression" ? "/" : "/progression"}
        >
          {page === "progression" ? "The map" : "The progress"}
        </Link>
        <ThemeToggle />
        <AccountRail account={account} />
      </div>
    </header>
  );
}
