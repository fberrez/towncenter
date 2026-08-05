import type { CSSProperties } from "react";

// CSSProperties has no index signature: the template key adds one so that
// `{ "--gauge": 0.4 }` is assignable.
export type StyleVars = CSSProperties & Record<`--${string}`, string | number>;

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
