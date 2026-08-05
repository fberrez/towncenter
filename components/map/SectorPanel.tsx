"use client";

// The sectors list. Failed surveys stay in it: a failed survey is exactly what
// you need to know in order to run it again.

import { useActionState, useEffect, useRef, useState } from "react";

import { renameZoneAction } from "@/app/actions";
import { initialActionState } from "@/app/actionState";
import type { ZoneRow } from "@/app/queries";
import { Button, Tag, Gauge, percent } from "@/components/ui";
import { formatEuros } from "@/lib/format";
import type { Bbox } from "@/lib/types";

import { sameFrame } from "./frame";
import { shortDate, formatNumber, plural } from "./text";

/** Finish one sector before opening another. */
const DISCIPLINE_THRESHOLD = 0.6;

/**
 * The sector whose survey is running, as the map knows it.
 *
 * It is not in `sectors` yet: that list comes from the server and only
 * re-renders after the first batch is written.
 */
export type SectorInProgress = {
  name: string;
  /** Last page read and estimated total. Null before the first response. */
  page: number | null;
  estimatedPages: number | null;
  read: number;
  created: number;
};

export type SectorPanelProps = {
  sectors: readonly ZoneRow[];
  currentFrame: Bbox;
  /** Recentres the map on this sector. */
  onGoTo: (bbox: Bbox, sector: ZoneRow) => void;
  /** Arms the draw mode. */
  onDraw: () => void;
  drawMode: boolean;
  /** Non-null while a survey runs. Renders a ghost card at the top. */
  inProgress: SectorInProgress | null;
};

function nameOf(sector: ZoneRow): string {
  if (sector.label && sector.label.trim() !== "") return sector.label;
  const day = shortDate(sector.startedAt);
  return day ? `Sector of ${day}` : "Unnamed sector";
}

export function SectorPanel({
  sectors,
  currentFrame,
  onGoTo,
  onDraw,
  drawMode,
  inProgress,
}: SectorPanelProps) {
  const [ruleLifted, setRuleLifted] = useState(false);
  /** The id of the sector being renamed. One at a time. */
  const [renaming, setRenaming] = useState<string | null>(null);

  const [renameState, rename, renamePending] = useActionState(
    renameZoneAction,
    initialActionState,
  );

  // Closes on the TOKEN, not on the state object: a rejected rename then a
  // corrected one would return the same `status` twice and the field would
  // never close.
  const lastToken = useRef(renameState.token);
  useEffect(() => {
    if (renameState.token === lastToken.current) return;
    lastToken.current = renameState.token;
    if (renameState.status === "success") setRenaming(null);
  }, [renameState]);

  // The sector being worked: the most recently opened one that returned
  // something. That is the one the rule asks you to finish.
  const current = sectors.find((sector) => sector.surveyed > 0) ?? null;
  const approachedShare =
    current && current.surveyed > 0 ? current.approached / current.surveyed : null;
  const ruleMet = approachedShare === null || approachedShare >= DISCIPLINE_THRESHOLD;

  return (
    <div className="sectors">
      <div className="sectors__head">
        <Tag as="h2">Sectors</Tag>
        <Button
          ton={drawMode ? "primary" : "secondaire"}
          size="compacte"
          onClick={onDraw}
          aria-pressed={drawMode}
        >
          {drawMode ? "Drawing armed" : "Draw"}
        </Button>
      </div>

      {current && !ruleMet && !ruleLifted ? (
        <div className="sectors__discipline">
          <Tag as="p">Discipline</Tag>
          <p className="t-body-s">
            You set yourself a rule: finish one sector before opening another.
          </p>
          <p className="t-body-s tnum">
            {nameOf(current)} — {current.approached} / {current.surveyed} approached,
            that is {percent((approachedShare ?? 0) * 100)}. Target{" "}
            {percent(DISCIPLINE_THRESHOLD * 100)}.
          </p>
          <Gauge
            value={(approachedShare ?? 0) / DISCIPLINE_THRESHOLD}
            tint="var(--text-1)"
            thickness="fine"
            label="Progress toward the rule"
          />
          <Button ton="discret" size="compacte" onClick={() => setRuleLifted(true)}>
            Lift the rule
          </Button>
        </div>
      ) : null}

      {ruleLifted ? (
        <p className="t-body-s tone-3 sectors__cheat">
          Rule lifted for this session. It is a deliberate cheat, and it is written
          here.
        </p>
      ) : null}

      {sectors.length === 0 && !inProgress ? (
        <p className="t-body-s tone-2 sectors__empty">
          No sector surveyed yet. Draw a rectangle on the map: it fills with every
          real business inside it.
        </p>
      ) : (
        <ul className="sectors__list">
          {inProgress ? (
            <li>
              <div className="sector sector--ghost" aria-busy="true">
                <span className="t-title-3 sector__ghost-name">{inProgress.name}</span>
                <span className="t-micro sector__running">Survey running</span>

                {/* Skeleton bars instead of the figures we do not have yet.
                    They promise nothing: the real count appears below as soon
                    as the first page comes back. */}
                <span className="sector__bone" aria-hidden="true" />
                <span className="sector__bone sector__bone--short" aria-hidden="true" />

                <span className="t-body-s sector__figures tnum">
                  {inProgress.page === null
                    ? "Opening the sector…"
                    : `Page ${inProgress.page}${
                        inProgress.estimatedPages ? ` of ~${inProgress.estimatedPages}` : ""
                      } · ${plural(inProgress.read, "business read", "businesses read")} · ${
                        inProgress.created
                      } new`}
                </span>
              </div>
            </li>
          ) : null}

          {sectors.map((sector) => {
            const here = sameFrame(sector.bbox, currentFrame);
            const hasBeenSurveyed = sector.surveyed > 0;
            const isRenaming = renaming === sector.id;

            return (
              <li key={sector.id}>
                {/* The card link is STRETCHED over the whole card with an
                    absolute `::after`, so anything added afterwards falls
                    underneath it and becomes visible but inert. The rename
                    button and its field are lifted back out by
                    `.sector__actions` in `map.css`. */}
                <div
                  className="sector"
                  data-status={sector.status}
                  data-here={here ? "yes" : "no"}
                  data-renaming={renaming ? "yes" : "no"}
                >
                  <button
                    type="button"
                    className="t-title-3 sector__name"
                    aria-current={here ? "true" : undefined}
                    onClick={() => onGoTo(sector.bbox, sector)}
                  >
                    {nameOf(sector)}
                  </button>

                  {sector.status === "failed" ? (
                    <span className="t-micro sector__failure">Survey interrupted</span>
                  ) : null}
                  {sector.status === "running" ? (
                    <span className="t-micro sector__running">Survey running</span>
                  ) : null}

                  <Gauge
                    value={sector.hold}
                    segments={5}
                    tint="var(--text-1)"
                    label={`Hold on ${nameOf(sector)}`}
                  />

                  <span className="t-body-s sector__figures tnum">
                    {hasBeenSurveyed
                      ? `Hold ${percent(sector.hold * 100)} · ${plural(sector.surveyed, "surveyed", "surveyed")} · ${plural(sector.captures, "taken", "taken")}`
                      : "Not surveyed yet"}
                  </span>

                  {sector.capturedLootCents > 0 ? (
                    <span className="t-body-s sector__captured tnum">
                      {formatEuros(sector.capturedLootCents, { decimals: "never" })} taken here
                    </span>
                  ) : null}

                  <span className="t-body-s tone-3 tnum sector__area">
                    {formatNumber(sector.areaKm2, 2)} km²
                  </span>

                  {renaming ? (
                    <form
                      action={rename}
                      className="sector__actions sector__rename"
                      /* Keyed on the token: React 19 clears uncontrolled
                         fields after an action, so without this a rejected
                         rename would come back empty instead of showing what
                         was typed. */
                      key={renameState.token}
                    >
                      <input type="hidden" name="id" value={sector.id} />
                      <label className="sector__field">
                        <span className="sr-only">Sector name</span>
                        <input
                          name="label"
                          className="map__input"
                          defaultValue={sector.label ?? ""}
                          placeholder="Centre-ville"
                          maxLength={120}
                          autoComplete="off"
                          autoFocus
                        />
                      </label>
                      <Button
                        type="submit"
                        ton="primary"
                        size="compacte"
                        disabled={renamePending}
                      >
                        {renamePending ? "…" : "Keep"}
                      </Button>
                      <Button
                        ton="discret"
                        size="compacte"
                        onClick={() => setRenaming(null)}
                      >
                        Cancel
                      </Button>
                      <span className="t-body-s tone-3 sector__hint">
                        Clearing the field erases the name: the sector goes back to its date.
                      </span>
                    </form>
                  ) : (
                    <div className="sector__actions">
                      <Button
                        ton="discret"
                        size="compacte"
                        onClick={() => setRenaming(sector.id)}
                      >
                        Rename
                      </Button>
                    </div>
                  )}

                  {renameState.message && renaming === sector.id ? (
                    <p
                      className="t-body-s sector__message"
                      data-status={renameState.status}
                      role="status"
                    >
                      {renameState.message}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
