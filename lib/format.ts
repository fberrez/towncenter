// Display formatting, PINNED to fr-FR / Europe/Paris so server and client render
// the SAME string and no hydration mismatch is possible. Never make it configurable.

export const LOCALE = "fr-FR";
export const TIME_ZONE = "Europe/Paris";

export const EMPTY_VALUE = "-";

const numberFormatters = new Map<string, Intl.NumberFormat>();

function numberFormatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, options);
    numberFormatters.set(key, formatter);
  }
  return formatter;
}

export type EurosOptions = {
  decimals?: "auto" | "always" | "never"; // auto: cents shown only when non-zero
  withSymbol?: boolean; // false hides the euro sign
};

// Takes WHOLE CENTS: 125000 -> "1 250 €", 125050 -> "1 250,50 €". The thousands
// separator `Intl` produces in fr-FR is a narrow no-break space (U+202F), not a
// normal space; never substitute it by hand.
export function formatEuros(
  cents: number | null | undefined,
  options: EurosOptions = {},
): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) {
    return EMPTY_VALUE;
  }

  const { decimals = "auto", withSymbol = true } = options;
  const showDecimals =
    decimals === "always" || (decimals === "auto" && cents % 100 !== 0);
  const fractionDigits = showDecimals ? 2 : 0;

  return numberFormatter({
    style: withSymbol ? "currency" : "decimal",
    currency: "EUR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(cents / 100);
}

// takes a RATIO, not a percentage: 0.42 -> "42 %".
export function formatPercent(
  ratio: number | null | undefined,
  fractionDigits = 0,
): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) {
    return EMPTY_VALUE;
  }
  return numberFormatter({
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ratio);
}

// takes WHOLE TENTHS, as stored: 46 -> "4,6".
export function formatRatingTenths(tenths: number | null | undefined): string {
  if (tenths === null || tenths === undefined || !Number.isFinite(tenths)) {
    return EMPTY_VALUE;
  }
  return numberFormatter({
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(tenths / 10);
}
