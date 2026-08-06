// A cluster: the businesses that fit in the same round, presented as an
// objective. The grouping comes from `getClusters`, at the same radius as the
// proximity factor in the scoring.
//
// No `"use client"` directive: the component has neither state nor effects, so
// it lives in its caller's bundle — client when the map renders it with
// callbacks, server when a page renders it read-only.

import type { TargetCluster, TargetRow } from "@/app/queries";
import { Button, Card, Loot, Badge, Gauge, RankDot, percent } from "@/components/ui";
import { formatEuros } from "@/lib/format";

import styles from "./game.module.css";
import { measureCluster } from "./metrics";

/** Businesses listed before summarising. Beyond this it is no longer a round. */
const MEMBERS_SHOWN = 5;

export type ClusterCardProps = {
  cluster: TargetCluster;
  /**
   * The businesses in the frame, TAKES AND WITHDRAWALS INCLUDED.
   *
   * `getClusters` already drops what is out of play; without the full list the
   * cluster cannot say how much it has already returned.
   */
  targets: readonly TargetRow[];
  /** Opens the cluster on the map. Absent = the cluster is read-only. */
  onOpen?: () => void;
  /** Selects a business. Absent = rows are not clickable. */
  onTarget?: (targetId: string) => void;
  className?: string;
};

export function ClusterCard({ cluster, targets, onOpen, onTarget, className }: ClusterCardProps) {
  const metric = measureCluster(cluster, targets);
  const shown = metric.members.slice(0, MEMBERS_SHOWN);
  const rest = metric.members.length - shown.length;

  return (
    <Card asChild className={className}>
      <article>
        <div className={styles.cluster__head}>
          <div className={styles.cluster__titles}>
            <Badge>Cluster</Badge>
            {/* The cluster head is the business you would start the round with:
                the best expectancy still free. It names the cluster, which avoids
                inventing a name. */}
            <span className={`t-title-3 ${styles.cluster__name}`}>{cluster.topName}</span>
            <span className={`t-body-s ${styles.cluster__place}`}>
              {metric.engaged} business{metric.engaged > 1 ? "es" : ""} within{" "}
              {metric.radiusMeters} m
            </span>
          </div>
  
          <div className={styles.cluster__loot}>
            <Loot
              cents={metric.lootCents}
              size="title"
              label="Spoils to take"
              reason={
                metric.offGrid > 0
                  ? `+ ${metric.offGrid} off-grid, to price`
                  : null
              }
            />
          </div>
        </div>
  
        {/* The hold, in five blocks — the same visual language as the map's
            permanent badge. The `Hold` primitive is not reused here: it is built
            to float alone on the map, with its own background and the sector name
            repeated in the footer, which would be a third name inside a card that
            already has one. */}
        {metric.engaged > 0 ? (
          <div className={styles.cluster__hold}>
            <Badge>Hold</Badge>
            <Gauge
              value={metric.hold}
              segments={5}
              tint="var(--text-1)"
              name={`${metric.captures} taken of ${metric.engaged}`}
              valueText={percent(Math.round(metric.hold * 100))}
            />
          </div>
        ) : null}
  
        {metric.ranks.length > 0 ? (
          <div className={styles.cluster__ranks}>
            {metric.ranks.map(({ rank, count }) => (
              /* `data-rank` exposes `--rank-color`: without it the dot is
                 transparent, with no error to say so. */
              <span
                key={rank.key}
                className={`t-body-s ${styles.cluster__rank}`}
                data-rank={rank.level}
              >
                <RankDot rank={rank} aligned />
                {rank.label} {count}
              </span>
            ))}
          </div>
        ) : null}
  
        {shown.length > 0 ? (
          <ul className={styles.cluster__members}>
            {shown.map((member) => {
              const offGrid = member.score.price.kind === "off-grid";
              const content = (
                <>
                  <RankDot rank={member.rarity.rank} aligned />
                  <span className={`t-body ${styles["cluster__member-name"]}`}>
                    {member.name}
                  </span>
                  <span className={`t-body-s tnum ${styles["cluster__member-loot"]}`}>
                    {offGrid
                      ? "off-grid"
                      : formatEuros(member.score.expectancyCents, { decimals: "never" })}
                  </span>
                </>
              );
  
              return (
                <li key={member.id} data-rank={member.rarity.rank.level}>
                  {onTarget ? (
                    <button
                      type="button"
                      className={styles.cluster__member}
                      onClick={() => onTarget(member.id)}
                    >
                      {content}
                    </button>
                  ) : (
                    <span className={styles.cluster__member}>{content}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={`t-body ${styles.cluster__rest}`}>
            Nothing left to take here. {metric.captures} taken
            {metric.withdrawals > 0 ? `, ${metric.withdrawals} withdrawn` : ""}.
          </p>
        )}
  
        {rest > 0 ? (
          <p className={`t-body-s ${styles.cluster__rest}`}>
            and {rest} more business{rest > 1 ? "es" : ""} to take
          </p>
        ) : null}
  
        {onOpen ? (
          <div className={styles.cluster__actions}>
            <Button variant="secondary" onClick={onOpen} fullWidth>
              Open the cluster
            </Button>
          </div>
        ) : null}
      </article>
    </Card>
  );
}
