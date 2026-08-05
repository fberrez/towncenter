export { Hud, type HudProps } from "./Hud";

// TODO: neither of these two is mounted anywhere yet. Celebration would show a
// second Stamp next to the one TargetSheet already renders, and the map draws
// clusters as bubbles with nowhere to put ClusterCard.
export { Celebration, type CelebrationProps } from "./Celebration";
export { ClusterCard, type ClusterCardProps } from "./ClusterCard";

export {
  lootInView,
  measureModel,
  measureCluster,
  bankedByMonth,
  streakWeek,
  bestStreak,
  caveats,
  type VisibleReach,
  type ModelHonesty,
  type CalibrationBand,
  type ClusterMetrics,
  type MonthBanked,
} from "./metrics";
