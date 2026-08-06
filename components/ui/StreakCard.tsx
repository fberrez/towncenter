import type { Streak } from "@/lib/game";

import { Badge } from "./badge";
import { cx } from "./style";

// Monday -> Sunday. The week starts on Monday, like the French calendar the
// businesses live by; the interface language does not decide that.
const INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** "2026-08-03" -> "03/08". No `Date`, so no timezone risk. */
function shortDate(key: string): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/**
 * The streak: consecutive days with at least one qualifying fact.
 *
 * Only days where someone was actually spoken to count (see `STREAK_KINDS`).
 * Surveying a sector does not hold the streak, or the counter would climb
 * without a single phone call.
 */
export type StreakCardProps = {
  streak: Streak;
  /** Best total ever reached. `null` = no history yet. */
  record?: number | null;
  /** Seven booleans, Monday to Sunday. `null` = strip hidden. */
  week?: readonly boolean[] | null;
  variant?: "hud" | "tile";
  className?: string;
};

export function StreakCard({
  streak,
  record = null,
  week = null,
  variant = "tile",
  className,
}: StreakCardProps) {
  const figureSize = variant === "hud" ? "t-title-2" : "t-hero";

  return (
    <div className={cx("streak", streak.aliveToday && "streak--alive", className)}>
      <Badge>Streak</Badge>

      <span className={cx(figureSize, "tnum", "streak__days")}>
        {streak.days}
        {/* "6 d", never "6d". The space is thin and NON-BREAKING, and it goes
            through an ESCAPE, never typed literally: a literal one is invisible
            in review and the first find-and-replace turns it into an ordinary
            space. Same rule as the "%" in percent(). */}
        {"\u202F"}
        <span className="streak__unit">d</span>
        <span className="sr-only">
          {streak.days === 0
            ? " — no streak running"
            : ` — ${streak.days} days in a row`}
        </span>
      </span>

      {record !== null && record > 0 ? (
        <span className="t-body-s tone-2 tnum">Best {record} d</span>
      ) : null}

      {streak.days === 0 ? (
        <span className="t-body-s tone-2">
          {streak.lastDay
            ? `Last exchange on ${shortDate(streak.lastDay)}.`
            : "No exchange on record."}
        </span>
      ) : streak.atRisk ? (
        <span className="t-body-s tone-2">Nothing today. It holds until tonight.</span>
      ) : (
        <span className="t-body-s tone-2">Held today.</span>
      )}

      {week ? (
        <div className="streak__week">
          {INITIALS.map((initial, index) => (
            <span className="streak__day" key={DAY_NAMES[index]}>
              <span
                className="streak__cell"
                data-held={week[index] ? "yes" : "no"}
                aria-hidden="true"
              />
              <span className="streak__initial" aria-hidden="true">
                {initial}
              </span>
              <span className="sr-only">
                {DAY_NAMES[index]}: {week[index] ? "held" : "nothing"}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
