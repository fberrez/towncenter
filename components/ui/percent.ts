import { formatPercent } from "@/lib/format";

// a percentage renders with no decimal, already rounded to 5 by the caller, and
// takes a whole 0-100 rather than a ratio: `62` -> "62 %". the space before the
// "%" is non-breaking and comes from Intl or an escape, never typed.
export function percent(whole: number): string {
  if (!Number.isFinite(whole)) return "—";
  return formatPercent(Math.round(whole) / 100);
}

export function nonBreaking(text: string): string {
  return text.replace(/ (?=[%€])/g, "\u00A0");
}
