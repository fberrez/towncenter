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
import { Loot, Badge, Gauge, LevelCard, Card, CardHeader, CardTitle, CardAction, StreakCard, percent } from "@/components/ui";
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
  title: "Progression · Towncenter",
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
  survey: "Repérée",
  study: "Étude",
  contact: "Contact",
  reply: "Réponse",
  take: "Signée",
  withdrawal: "Abandonnée",
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
          <h1 className={`t-title-1 ${styles.page__title}`}>La progression</h1>
          <p className={`t-body-s ${styles.page__season}`}>
            Saison · {progression.season.daysLeft} jour
            {progression.season.daysLeft > 1 ? "s" : ""} restant{progression.season.daysLeft > 1 ? "s" : ""} · du {" "}
            {shortDate(progression.season.startsAt)} au {" "}
            {shortDate(progression.season.endsAt)}
          </p>
        </header>

        <section className={styles.section}>
          <div className={styles.tiles}>
            <Card>
              <Loot
                cents={seasonReport.capturedCents}
                size="hero"
                label="Signé cette saison"
                recurringCents={
                  seasonReport.recurringEstimatedCents > 0 ? seasonReport.recurringEstimatedCents : null
                }
              />
              <p className={`t-body-s tnum ${styles.tile__extra}`}>
                {seasonReport.capturesCount} signé{seasonReport.capturesCount > 1 ? "s" : ""} · {seasonReport.withdrawalsCount} abandonné{seasonReport.withdrawalsCount > 1 ? "s" : ""}
                {seasonReport.recurringEstimatedCents > 0 ? " · récurrent estimé, non signé" : ""}
              </p>
              {seasonReport.capturesCount === 0 ? (
                /* The zero is shown as-is, followed by a fact. No encouragement,
                   no tile that disappears. */
                <p className={`t-body-s ${styles.empty}`}>
                  Aucune signature cette saison. {seasonReport.inPlayCount} entreprise
                  {seasonReport.inPlayCount > 1 ? "s" : ""} encore en jeu.
                </p>
              ) : null}
            </Card>

            <Card>
              {/* the gold stays on the first tile: what is still in play is not
                  money, it is an estimate */}
              <Loot
                cents={seasonReport.inPlayCents}
                size="hero"
                label="Encore en jeu"
                ton="neutral"
              />
              <p className={`t-body-s tnum ${styles.tile__extra}`}>
                estimation sur {seasonReport.inPlayCount} entreprise
                {seasonReport.inPlayCount > 1 ? "s" : ""}
                {averageOdds === null
                  ? ""
                  : ` · probabilité moyenne ${percent(averageOdds)}`}
              </p>
              {seasonReport.truncated ? (
                <p className={`t-body-s ${styles.empty}`}>
                  La limite de lecture a été atteinte : ce total est un minimum.
                </p>
              ) : null}
            </Card>

            <Card>
              <StreakCard streak={seasonReport.streak} record={record} week={week} />
            </Card>
          </div>

          <div className={`${styles.tiles} ${styles["tiles--two"]}`}>
            <Card>
              <LevelCard level={progression.level} />
              <p className={`t-body-s tnum ${styles.tile__extra}`}>
                {progression.eventCount} fact
                {progression.eventCount > 1 ? "s" : ""} consigné{progression.eventCount > 1 ? "s" : ""}
                {" · "}
                la progression est figée au moment du fait, jamais recalculée
              </p>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>La saison</CardTitle>
              </CardHeader>
              <Gauge
                value={seasonAdvance}
                name="Écoulée"
                valueText={`${SEASON_DAYS - progression.season.daysLeft} / ${SEASON_DAYS} j`}
                tint="var(--text-1)"
              />
              <p className={`t-body-s ${styles.tile__extra}`}>
                Trente jours glissants. Cette durée limite l’effort et remet le compteur à
                zéro : un mauvais mois ne pèse pas pour toujours. Il n’y a ni classement
                général ni adversaire — le seul classement du produit est celui des secteurs, ci-dessous.
              </p>
            </Card>
          </div>
        </section>

        {/* The section this page exists for: what the model announced, set
            against what actually happened. Do not remove it or soften it. */}
        <Card>
          <CardHeader>
            <CardTitle>L’honnêteté du modèle</CardTitle>
          </CardHeader>
          <div className={styles.honesty}>
            <p className={`t-body ${styles.section__intro}`}>
              Ce que le modèle annonce, comparé à ce qui s’est réellement produit. Deux
              mesures qui ne disent pas la même chose : le PRIX compare les euros des
              entreprises signées, les PROBABILITÉS comparent les taux, tranche par tranche.
            </p>

            <div className={styles.honesty__count}>
              <p className={`t-title-3 ${styles.honesty__verdict}`}>
                {met.calibrated
                  ? `Étalonné sur ${met.issues} résultats connus.`
                  : `Pas encore étalonné, n = ${met.issues}.`}
              </p>
              <Gauge
                value={met.issues / CALIBRATION_MIN_OUTCOMES}
                name="Résultats connus"
                valueText={`${met.issues} / ${CALIBRATION_MIN_OUTCOMES}`}
                tint="var(--text-1)"
              />
              <p className="t-body-s tone-2 tnum">
                {met.captures} signé{met.captures > 1 ? "s" : ""} · {met.withdrawals} abandonné{met.withdrawals > 1 ? "s" : ""}
                {met.missing > 0
                  ? ` · encore ${met.missing} avant que ces chiffres aient un sens`
                  : ""}
              </p>
            </div>

            <div>
              <Badge asChild><h3>Prix annoncé face au prix signé</h3></Badge>
              <div className={styles.honesty__gap}>
                <Loot
                  cents={met.comparable > 0 ? met.promisedCents : null}
                  size="title"
                  label="Annoncé par la grille"
                  ton="neutral"
                  reason={met.comparable > 0 ? null : "aucune signature comparable"}
                />
                <Loot
                  cents={met.comparable > 0 ? met.deliveredCents : null}
                  size="title"
                  label="Réellement signé"
                  reason={null}
                />
                <div>
                  <Badge>Respecté</Badge>
                  <p className={`t-title-1 tnum ${styles["honesty__gap-value"]}`}>
                    {met.met === null ? "—" : percent(met.met * 100)}
                  </p>
                </div>
              </div>
              <p className="t-body-s tone-2 tnum">
                Sur {met.comparable} signature tarifée
                {met.comparable > 1 ? "s" : ""}. Le montant consigné est celui de la
                signature ponctuelle : il est donc comparé au prix de la grille, jamais à
                la valeur sur douze mois.
              </p>
            </div>

            <div>
              <Badge asChild>
                <h3>
                  Probabilité annoncée face au taux réellement observé
                </h3>
              </Badge>
              <table className={`${styles.table} t-body-s`}>
                <thead>
                  <tr>
                    <th className={styles.table__name} scope="col">
                      Probabilité annoncée
                    </th>
                    <th className={styles.table__number} scope="col">
                      Résultats
                    </th>
                    <th className={styles.table__number} scope="col">
                      Signées
                    </th>
                    <th className={styles.table__number} scope="col">
                      Annoncée
                    </th>
                    <th className={styles.table__number} scope="col">
                      Réelle
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {met.bands.map((band) => (
                    <tr key={band.key} data-empty={band.issues === 0 ? "yes" : "no"}>
                      <td className={styles.table__name}>{band.label}</td>
                      <td className={styles.table__number} data-label="Résultats">
                        {band.issues}
                      </td>
                      <td className={styles.table__number} data-label="Signées">
                        {band.captures}
                      </td>
                      <td className={styles.table__number} data-label="Annoncée">
                        {band.announced === null ? "—" : percent(band.announced)}
                      </td>
                      <td className={styles.table__number} data-label="Réelle">
                        {band.actual === null ? "—" : percent(band.actual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={`t-body-s ${styles.table__note}`}>
                Un modèle honnête rapproche les deux dernières colonnes, ligne par ligne.
                Une tranche vide affiche « — » et n’est comptée nulle part : une absence n’est pas un zéro.
              </p>
            </div>

            <div>
              <Badge asChild><h3>Ce que cette page ne démontre pas encore</h3></Badge>
              <ul className={`t-body-s ${styles.honesty__caveats}`}>
                {caveats(met).map((row) => (
                  <li key={row}>{row}</li>
                ))}
                {issues.truncated ? (
                  <li>
                    La limite de lecture a été atteinte : il existe davantage de résultats
                    que ceux comptés ici.
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Les secteurs</CardTitle>
            <CardAction>
              <span className="t-body-s tone-2">triés par butin signé</span>
            </CardAction>
          </CardHeader>
          {sectors.length === 0 ? (
            <p className={`t-body ${styles.empty}`}>
              Aucun secteur relevé. La carte attend son premier tracé.
            </p>
          ) : (
            <>
              <table className={`${styles.table} t-body-s`}>
                <thead>
                  <tr>
                    <th className={styles.table__name} scope="col">
                      Secteur
                    </th>
                    <th className={styles.table__number} scope="col">
                      Relevé
                    </th>
                    <th className={styles.table__number} scope="col">
                      Approchée
                    </th>
                    <th className={styles.table__number} scope="col">
                      Signée
                    </th>
                    <th className={styles.table__number} scope="col">
                      Emprise
                    </th>
                    <th className={styles.table__gold} scope="col">
                      Butin signé
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sectors.map((zone) => (
                    <tr key={zone.id} data-empty={zone.surveyed === 0 ? "yes" : "no"}>
                      <td className={styles.table__name} title={zone.label ?? undefined}>
                        {zone.label ?? "Secteur sans nom"}
                        {zone.status === "failed" ? " · relevé échoué" : ""}
                        {zone.status === "running" ? " · relevé en cours" : ""}
                      </td>
                      <td className={styles.table__number} data-label="Relevé">
                        {zone.surveyed}
                      </td>
                      <td className={styles.table__number} data-label="Approchée">
                        {zone.approached}
                      </td>
                      <td className={styles.table__number} data-label="Signée">
                        {zone.captures}
                      </td>
                      <td className={styles.table__number} data-label="Emprise">
                        {zone.surveyed === 0 ? "—" : percent(zone.hold * 100)}
                      </td>
                      <td className={styles.table__gold} data-label="Butin signé">
                        {zone.capturedLootCents === 0
                          ? "—"
                          : formatEuros(zone.capturedLootCents, { decimals: "never" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={`t-body-s ${styles.table__note}`}>
                Les compteurs sont recomptés à la lecture, sans reprendre le relevé : un
                relevé indique ce qu’il a renvoyé ce jour-là et le terrain évolue à chaque
                signature. Un secteur en échec reste dans la liste : c’est précisément ce
                qu’il faut savoir pour le relancer.
              </p>
            </>
          )}
        </Card>

        <div className={`${styles.tiles} ${styles["tiles--two"]}`}>
          <Card>
            <CardHeader>
              <CardTitle>Répartition des rangs</CardTitle>
            </CardHeader>
            {seasonReport.ranks.length === 0 ? (
              <p className={`t-body ${styles.empty}`}>Rien en jeu pour le moment.</p>
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
                      label={`${part.label} : ${part.count} entreprises`}
                    />
                    <span className={`t-body-s tnum ${styles.bar__value}`}>
                      {part.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className={`t-body-s ${styles.table__note}`}>
              Sur ce qui est encore en jeu. Le rang suit la valeur attendue — ce que le
              contrat rapporte, multiplié par la probabilité de le signer — et non le devis
              seul : un gros devis que vous ne signerez pas n’est pas une grande signature.
            </p>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Butin signé, mois par mois</CardTitle>
            </CardHeader>
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
              Montants réellement signés, jamais une estimation. Les mois vides restent
              affichés : les retirer transformerait deux signatures en janvier et deux en
              juin en une courbe joliment ascendante.
            </p>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Le journal</CardTitle>
          </CardHeader>
          {log.length === 0 ? (
            <p className={`t-body ${styles.empty}`}>Aucun fait consigné.</p>
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
            Texte simple, sans couleur de rang ni icône. C’est ce qui garde le journal
            lisible à froid six mois plus tard, y compris les mauvais jours.
          </p>
        </Card>
      </main>
    </>
  );
}
