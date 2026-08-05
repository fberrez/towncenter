"use client";

import { useEffect, useRef, useState } from "react";

import { formatEuros, type EurosOptions } from "@/lib/format";

// it does NOT animate on mount: rendering "0 €" server-side would ship a FALSE
// amount in the HTML. it rolls when the value CHANGES, and
// `prefers-reduced-motion` skips the roll and places the final value.
export type RollingAmountProps = {
  // INTEGER CENTS, never a float: this is money.
  cents: number;
  decimals?: EurosOptions["decimals"];
  durationMs?: number;
  className?: string;
};

function motionReduced(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function RollingAmount({
  cents,
  decimals = "never",
  durationMs = 700,
  className,
}: RollingAmountProps) {
  const [shown, setShown] = useState(cents);
  // on first render this equals `cents`, so the effect finds no change.
  const previous = useRef(cents);

  useEffect(() => {
    const startCents = previous.current;
    previous.current = cents;

    if (startCents === cents) {
      setShown(cents);
      return;
    }

    if (motionReduced()) {
      setShown(cents);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const delta = cents - startCents;

    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      // ease out, never overshoot: a real amount is not overrun for one frame.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(startCents + delta * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [cents, durationMs]);

  return <span className={className}>{formatEuros(shown, { decimals: decimals })}</span>;
}
