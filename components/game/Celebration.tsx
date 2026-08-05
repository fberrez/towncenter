"use client";

// orchestrates the design system's Stamp: a take or a withdrawal gets the
// full-frame stamp, anything else a banner that fades on its own, and a tier
// reached gets the banner after the stamp, never at the same time.

import { useCallback, useEffect, useRef, useState } from "react";

import type { ActionResult, AdvanceResult } from "@/app/actionState";
import { Stamp } from "@/components/ui";
import type { EventKind } from "@/lib/types";

import styles from "./game.module.css";

const BANNER_MS = 2_600;
// under reduced motion the banner stays LONGER, not shorter: it blocks nothing
// and the live region still has to finish being announced.
const BANNER_REDUCED_MS = 5_200;

const EVENT_LABEL_SHORT: Record<EventKind, string> = {
  survey: "spotted",
  study: "studied",
  contact: "called",
  reply: "reply received",
  take: "taken",
  withdrawal: "withdrawn",
};

function motionReduced(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Step = "stamp" | "banner";

type Scene = {
  advance: AdvanceResult;
  step: Step;
};

export type CelebrationProps = {
  result: ActionResult | null;
  // the token triggers the replay, not the object: two takes on the same
  // business produce results identical field for field.
  token: number;
  /** on a withdrawal, the reason as typed, never reworded. */
  reason?: string | null;
  onClose?: () => void;
};

export function Celebration({ result, token, reason = null, onClose }: CelebrationProps) {
  const [scene, setScene] = useState<Scene | null>(null);

  // a ref, not state: reading the token already played must not render.
  const playedToken = useRef(-1);

  useEffect(() => {
    if (playedToken.current === token) return;
    playedToken.current = token;

    if (!result || result.kind !== "advance") return;

    const fullFrame = result.to === "taken" || result.to === "withdrawn";
    setScene({ advance: result, step: fullFrame ? "stamp" : "banner" });
  }, [token, result]);

  const onDoneRef = useRef(onClose);
  useEffect(() => {
    onDoneRef.current = onClose;
  });

  const bannerVisible = scene?.step === "banner";

  useEffect(() => {
    if (!bannerVisible) return;
    const duration = motionReduced() ? BANNER_REDUCED_MS : BANNER_MS;
    const timer = window.setTimeout(() => {
      setScene(null);
      onDoneRef.current?.();
    }, duration);
    return () => window.clearTimeout(timer);
    // `scene` would be an unstable dependency: only the move to the banner step
    // starts the timer, and the token tells a new celebration from the same one.
  }, [bannerVisible, token]);

  const closeStamp = useCallback(() => {
    setScene((previous) => {
      if (!previous) return null;
      // a tier reached is announced after the stamp, never on top of it.
      if (previous.advance.levelUp) return { ...previous, step: "banner" };
      onDoneRef.current?.();
      return null;
    });
  }, []);

  if (!scene) return null;

  const { advance } = scene;

  if (scene.step === "stamp") {
    const capture = advance.to === "taken";
    const sector =
      advance.zoneLabel !== null &&
      advance.holdBefore !== null &&
      advance.holdAfter !== null
        ? {
            name: advance.zoneLabel,
            holdBefore: advance.holdBefore,
            holdAfter: advance.holdAfter,
          }
        : null;

    return (
      <Stamp
        open
        kind={capture ? "take" : "withdrawal"}
        business={advance.targetName}
        lootCents={advance.valueCents}
        // the off-grid null guard lives in advanceTargetAction, not here.
        recurringCents={advance.recurringCents}
        sector={sector}
        reason={reason}
        onClose={closeStamp}
      />
    );
  }

  const complement = advance.levelUp
    ? `Tier ${advance.level} · ${advance.levelLabel}`
    : advance.streakExtended
      ? `Streak ${advance.streakDays} d`
      : `${advance.totalXp} progress points in total`;

  return (
    <div className={styles.gain} role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.gain__card}>
        <span className={`t-title-2 tnum ${styles.gain__points}`}>
          + {advance.xp}
          <span className="sr-only"> progress points</span>
        </span>
        <span className={styles.gain__texts}>
          <span className={`t-body ${styles.gain__fact}`}>
            {advance.targetName} · {EVENT_LABEL_SHORT[advance.event]}
          </span>
          <span className={`t-body-s ${styles.gain__detail}`}>{complement}</span>
        </span>
      </div>
    </div>
  );
}
