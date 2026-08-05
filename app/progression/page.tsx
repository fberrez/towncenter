// The progress table: what the map cannot show, which is time.
//
// ONE register per screen: odds. Resistance and odds say the same thing to
// within one unit, and side by side they read as two measurements. This page
// talks about a PREDICTION set against an OUTCOME, so it speaks in odds
// throughout and never uses the word "resistance".
//
// `force-dynamic` is mandatory: without it Next prerenders this page at build
// time and the HTML freezes the database state forever.

import {
  Hud,
  bankedByMonth,
  caveats,
  measureModel,
  bestStreak,
  streakWeek,
} from "@/components/game";
import styles from "@/components/game/game.module.css";
import { Loot, Tag, Gauge, LevelCard, Panel, StreakCard, percent } from "@/components/ui";
import { formatEuros } from "@/lib/format";
import { SEASON_DAYS } from "@/lib/game";
import { MAX_TARGETS_IN_VIEW } from "@/lib/limits";
import { requireUser } from "@/lib/accounts";
import { CALIBRATION_MIN_OUTCOMES, type Bbox, type EventKind } from "@/lib/types";

import {
  getSeasonReport,
  getBankedTotalCents,
  getProgression,
  listJournal,
  listTargetsInBbox,
  listZones,
  type ZoneRow,
} from "../queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Progress · Towncenter",
};

// The reads are written around a frame because the map drives them. There is no
// map here, so the whole world is requested: bboxCondition treats it as four
// comparisons that are always true. listTargetsInBbox's ceiling still applies
// and is exposed.
const WHOLE_TERRITORY: Bbox = {
  minLat: -90,
  maxLat: 90,
  minLng: -180,
  maxLng: 180,
};

/** Facts loaded for the streak and the months. listJournal's ceiling is 500. */
const JOURNAL_WINDOW = 500;

/** Ledger rows shown. Enough to reread a fortnight, not enough to scroll forever. */
const LOG_ROWS = 60;

/** Months shown in the take history. */
const MONTHS_SHOWN = 12;

/** Visible text. No superlative, no icon. */
const EVENT_LABEL_SHORT: Record<EventKind, string> = {
  survey: "Spotted",
  study: "Study",
  contact: "Contact",
  reply: "Reply",
  take: "Taken",
  withdrawal: "Withdrawn",
};

/**
 * "2026-08-03T09:12:00.000Z" -> "03/08".
 *
 * String slicing, not a Date: server and client then produce exactly the same
 * characters, so no hydration mismatch is possible. The streak is the only place
 * where the exact time zone changes a count, and it handles it itself.
 */
function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function byCapturedLoot(a: ZoneRow, b: ZoneRow): number {
  if (b.capturedLootCents !== a.capturedLootCents) return b.capturedLootCents - a.capturedLootCents;
  return b.surveyed - a.surveyed;
}

export default async function ProgressionPage() {
  // the owner bounds EVERY read below, and is read first: with no account the
  // page has nothing to load and goes back to the gate
  const owner = await requireUser();

  const [progression, seasonReport, banked, zones, log, captureEvents, exchanges, issues] =
    await Promise.all([
      getProgression(owner),
      getSeasonReport(owner),
      getBankedTotalCents(owner),
      listZones(owner, 24),
      listJournal(owner, { limit: LOG_ROWS }),
      listJournal(owner, { kinds: ["take"], limit: JOURNAL_WINDOW }),
      listJournal(owner, {
        kinds: ["contact", "take"],
        limit: JOURNAL_WINDOW,
      }),
      listTargetsInBbox(owner, WHOLE_TERRITORY, {
        states: ["taken", "withdrawn"],
        limit: MAX_TARGETS_IN_VIEW,
      }),
    ]);

  const met = measureModel(issues.rows, captureEvents);
  const months = bankedByMonth(captureEvents, MONTHS_SHOWN);
  const week = streakWeek(exchanges);
  const record = bestStreak(exchanges);

  const sectors = [...zones].sort(byCapturedLoot);
  const maxRankCount = seasonReport.ranks.reduce((max, part) => Math.max(max, part.count), 0);
  const maxMonthCents = months.reduce((max, part) => Math.max(max, part.cents), 0);

  // one register per screen: odds, never resistance
  const averageOdds =
    seasonReport.averageResistance === null ? null : 100 - seasonReport.averageResistance;

  const seasonAdvance = (SEASON_DAYS - progression.season.daysLeft) / SEASON_DAYS;

  return (
    <>
      <Hud
        account={owner}
        page="progression"
        progression={progression}
        bankedCents={banked.cents}
        bankedCaptures={banked.captures}
        inPlayCents={seasonReport.inPlayCents}
        inPlayCount={seasonReport.inPlayCount}
        model={met}
      />

      <main className={styles.page}>
        <header className={styles.page__head}>
          <h1 className={`t-title-1 ${styles.page__title}`}>The progress</h1>
          <p className={`t-body-s ${styles.page__season}`}>
            Season · {progression.season.daysLeft} day
            {progression.season.daysLeft > 1 ? "s" : ""} left · from{" "}
            {shortDate(progression.season.startsAt)} to{" "}
            {shortDate(progression.season.endsAt)}
          </p>
        </header>

        <section className={styles.section}>
          <div className={styles.tiles}>
            <Panel>
              <Loot
                cents={seasonReport.capturedCents}
                size="hero"
                label="Taken this season"
                recurringCents={
                  seasonReport.recurringEstimatedCents > 0 ? seasonReport.recurringEstimatedCents : null
                }
              />
              <p className={`t-body-s tnum ${styles.tile__extra}`}>
                {seasonReport.capturesCount} taken · {seasonReport.withdrawalsCount} withdrawn
                {seasonReport.recurringEstimatedCents > 0 ? " · recurring estimated, not signed" : ""}
              </p>
              {seasonReport.capturesCount === 0 ? (
                /* The zero is shown as-is, followed by a fact. No encouragement,
                   no tile that disappears. */
                <p className={`t-body-s ${styles.empty}`}>
                  No take this season. {seasonReport.inPlayCount} business
                  {seasonReport.inPlayCount > 1 ? "es" : ""} still in play.
                </p>
              ) : null}
            </Panel>

            <Panel>
              {/* the gold stays on the first tile: what is still in play is not
                  money, it is an estimate */}
              <Loot
                cents={seasonReport.inPlayCents}
                size="hero"
                label="Still in play"
                ton="neutral"
              />
              <p className={`t-body-s tnum ${styles.tile__extra}`}>
                estimated over {seasonReport.inPlayCount} business
                {seasonReport.inPlayCount > 1 ? "es" : ""}
                {averageOdds === null
                  ? ""
                  : ` · average odds ${percent(averageOdds)}`}
              </p>
              {seasonReport.truncated ? (
                <p className={`t-body-s ${styles.empty}`}>
                  The read ceiling cut in: this total is a floor.
                </p>
              ) : null}
            </Panel>

            <Panel>
              <StreakCard streak={seasonReport.streak} record={record} week={week} />
            </Panel>
          </div>

          <div className={`${styles.tiles} ${styles["tiles--two"]}`}>
            <Panel>
              <LevelCard level={progression.level} />
              <p className={`t-body-s tnum ${styles.tile__extra}`}>
                {progression.eventCount} fact
                {progression.eventCount > 1 ? "s" : ""} logged
                {" · "}
                progress is frozen at the moment of the fact, never recomputed
              </p>
            </Panel>

            <Panel title="The season">
              <Gauge
                value={seasonAdvance}
                name="Elapsed"
                valueText={`${SEASON_DAYS - progression.season.daysLeft} / ${SEASON_DAYS} j`}
                tint="var(--text-1)"
              />
              <p className={`t-body-s ${styles.tile__extra}`}>
                Thirty rolling days. It bounds the effort and resets the counter: a bad
                month does not weigh forever. There is no leaderboard and no opponent —
                the only ranking in the product is the one of sectors, below.
              </p>
            </Panel>
          </div>
        </section>

        {/* The section this page exists for: what the model announced, set
            against what actually happened. Do not remove it or soften it. */}
        <Panel title="The model’s honesty">
          <div className={styles.honesty}>
            <p className={`t-body ${styles.section__intro}`}>
              What the model announces, set against what actually happened. Two
              measures, and they do not say the same thing: PRICE compares in euros on
              the businesses taken, ODDS compare as rates, band by band.
            </p>

            <div className={styles.honesty__count}>
              <p className={`t-title-3 ${styles.honesty__verdict}`}>
                {met.calibrated
                  ? `Calibrated on ${met.issues} known outcomes.`
                  : `Not calibrated yet, n = ${met.issues}.`}
              </p>
              <Gauge
                value={met.issues / CALIBRATION_MIN_OUTCOMES}
                name="Known outcomes"
                valueText={`${met.issues} / ${CALIBRATION_MIN_OUTCOMES}`}
                tint="var(--text-1)"
              />
              <p className="t-body-s tone-2 tnum">
                {met.captures} taken · {met.withdrawals} withdrawn
                {met.missing > 0
                  ? ` · ${met.missing} more before these figures mean anything`
                  : ""}
              </p>
            </div>

            <div>
              <Tag as="h3">Announced price against signed price</Tag>
              <div className={styles.honesty__gap}>
                <Loot
                  cents={met.comparable > 0 ? met.promisedCents : null}
                  size="title"
                  label="Announced by the grid"
                  ton="neutral"
                  reason={met.comparable > 0 ? null : "no comparable take"}
                />
                <Loot
                  cents={met.comparable > 0 ? met.deliveredCents : null}
                  size="title"
                  label="Actually signed"
                  reason={null}
                />
                <div>
                  <Tag>Held</Tag>
                  <p className={`t-title-1 tnum ${styles["honesty__gap-value"]}`}>
                    {met.met === null ? "—" : percent(met.met * 100)}
                  </p>
                </div>
              </div>
              <p className="t-body-s tone-2 tnum">
                Over {met.comparable} priced take
                {met.comparable > 1 ? "s" : ""}. The logged amount is the one-off
                take, so it is compared against the grid price, never against the
                twelve-month value.
              </p>
            </div>

            <div>
              <Tag as="h3">
                Announced odds against the rate actually observed
              </Tag>
              <table className={`${styles.table} t-body-s`}>
                <thead>
                  <tr>
                    <th className={styles.table__name} scope="col">
                      Announced odds
                    </th>
                    <th className={styles.table__number} scope="col">
                      Outcomes
                    </th>
                    <th className={styles.table__number} scope="col">
                      Taken
                    </th>
                    <th className={styles.table__number} scope="col">
                      Announced
                    </th>
                    <th className={styles.table__number} scope="col">
                      Actual
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {met.bands.map((band) => (
                    <tr key={band.key} data-empty={band.issues === 0 ? "yes" : "no"}>
                      <td className={styles.table__name}>{band.label}</td>
                      <td className={styles.table__number} data-label="Outcomes">
                        {band.issues}
                      </td>
                      <td className={styles.table__number} data-label="Taken">
                        {band.captures}
                      </td>
                      <td className={styles.table__number} data-label="Announced">
                        {band.announced === null ? "—" : percent(band.announced)}
                      </td>
                      <td className={styles.table__number} data-label="Actual">
                        {band.actual === null ? "—" : percent(band.actual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={`t-body-s ${styles.table__note}`}>
                An honest model brings the last two columns together, row by row. An
                empty band shows “—” and is counted nowhere: an absence is not a zero.
              </p>
            </div>

            <div>
              <Tag as="h3">What this page does not prove yet</Tag>
              <ul className={`t-body-s ${styles.honesty__caveats}`}>
                {caveats(met).map((row) => (
                  <li key={row}>{row}</li>
                ))}
                {issues.truncated ? (
                  <li>
                    The read ceiling cut in: there are more outcomes than the ones
                    counted here.
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        </Panel>

        <Panel title="The sectors" action={<span className="t-body-s tone-2">sorted by spoils taken</span>}>
          {sectors.length === 0 ? (
            <p className={`t-body ${styles.empty}`}>
              No sector surveyed. The map is waiting for a first outline.
            </p>
          ) : (
            <>
              <table className={`${styles.table} t-body-s`}>
                <thead>
                  <tr>
                    <th className={styles.table__name} scope="col">
                      Sector
                    </th>
                    <th className={styles.table__number} scope="col">
                      Surveyed
                    </th>
                    <th className={styles.table__number} scope="col">
                      Approached
                    </th>
                    <th className={styles.table__number} scope="col">
                      Taken
                    </th>
                    <th className={styles.table__number} scope="col">
                      Hold
                    </th>
                    <th className={styles.table__gold} scope="col">
                      Spoils taken
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sectors.map((zone) => (
                    <tr key={zone.id} data-empty={zone.surveyed === 0 ? "yes" : "no"}>
                      <td className={styles.table__name} title={zone.label ?? undefined}>
                        {zone.label ?? "Unnamed sector"}
                        {zone.status === "failed" ? " · survey failed" : ""}
                        {zone.status === "running" ? " · survey running" : ""}
                      </td>
                      <td className={styles.table__number} data-label="Surveyed">
                        {zone.surveyed}
                      </td>
                      <td className={styles.table__number} data-label="Approached">
                        {zone.approached}
                      </td>
                      <td className={styles.table__number} data-label="Taken">
                        {zone.captures}
                      </td>
                      <td className={styles.table__number} data-label="Hold">
                        {zone.surveyed === 0 ? "—" : percent(zone.hold * 100)}
                      </td>
                      <td className={styles.table__gold} data-label="Spoils taken">
                        {zone.capturedLootCents === 0
                          ? "—"
                          : formatEuros(zone.capturedLootCents, { decimals: "never" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={`t-body-s ${styles.table__note}`}>
                The counters are recounted on read, not taken from the survey: a survey
                says what it returned that day, and the ground moves with every take. A
                sector that failed stays in the list — that is precisely what you need to
                know in order to run it again.
              </p>
            </>
          )}
        </Panel>

        <div className={`${styles.tiles} ${styles["tiles--two"]}`}>
          <Panel title="Rank distribution">
            {seasonReport.ranks.length === 0 ? (
              <p className={`t-body ${styles.empty}`}>Nothing in play for now.</p>
            ) : (
              <div className={styles.bars}>
                {seasonReport.ranks.map((part) => (
                  /* data-rank exposes --rank-color: without it the bar renders
                     transparent and no error says so */
                  <div className={styles.bar} key={part.key} data-rank={part.level}>
                    <span className={`t-body-s ${styles.bar__name}`}>{part.label}</span>
                    <Gauge
                      value={maxRankCount > 0 ? part.count / maxRankCount : 0}
                      tint="var(--rank-color)"
                      label={`${part.label}: ${part.count} businesses`}
                    />
                    <span className={`t-body-s tnum ${styles.bar__value}`}>
                      {part.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className={`t-body-s ${styles.table__note}`}>
              Over what is still in play. Rank follows expected value — what the deal
              brings in, multiplied by the odds of signing it — and not the quote alone:
              a large quote you will not sign is not a large take.
            </p>
          </Panel>

          <Panel title="Spoils signed, month by month">
            <div className={styles.bars}>
              {months.map((part) => (
                <div className={styles.bar} key={part.key}>
                  <span className={`t-body-s ${styles.bar__name}`}>{part.label}</span>
                  <Gauge
                    value={maxMonthCents > 0 ? part.cents / maxMonthCents : 0}
                    tint="var(--accent)"
                    label={`${part.label}: ${formatEuros(part.cents, { decimals: "never" })}`}
                  />
                  <span
                    className={`t-body-s tnum ${styles.bar__value} ${part.cents > 0 ? styles["bar__value--accent"] : ""}`}
                  >
                    {part.cents === 0
                      ? "—"
                      : formatEuros(part.cents, { decimals: "never" })}
                  </span>
                </div>
              ))}
            </div>
            <p className={`t-body-s ${styles.table__note}`}>
              Amounts actually signed, never an estimate. Empty months stay on display:
              removing them would turn two takes in January and two in June into a curve
              that climbs nicely.
            </p>
          </Panel>
        </div>

        <Panel title="The log">
          {log.length === 0 ? (
            <p className={`t-body ${styles.empty}`}>No fact logged.</p>
          ) : (
            <ul className={styles.ledger}>
              {log.map((entry) => (
                <li className={styles.ledger__row} key={entry.id}>
                  <span className={`t-body-s tnum ${styles.ledger__date}`}>
                    {shortDate(entry.occurredAt)}
                  </span>
                  <span className={`t-body-s ${styles.ledger__fact}`}>
                    {EVENT_LABEL_SHORT[entry.kind]}
                  </span>
                  <span className={`t-body ${styles.ledger__what}`}>
                    {entry.targetName}
                    {entry.note ? ` — ${entry.note}` : ""}
                  </span>
                  <span className={`t-body-s tnum ${styles.ledger__amount}`}>
                    {entry.valueCents === null
                      ? ""
                      : formatEuros(entry.valueCents, { decimals: "never" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className={`t-body-s ${styles.table__note}`}>
            Plain text, no rank colour, no icon. That is what keeps the log readable
            cold six months later, including on the bad days.
          </p>
        </Panel>
      </main>
    </>
  );
}
