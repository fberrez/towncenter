import { Loader2Icon } from "lucide-react";

import { cx } from "./style";

export type SpinnerProps = {
  className?: string;
};

/**
 * The pending mark every button in the product sits its label next to. It
 * takes `currentColor`, so it always matches the button it's in — primary,
 * danger, quiet — with no variant of its own to keep in sync.
 */
export function Spinner({ className }: SpinnerProps) {
  return (
    <Loader2Icon className={cx("size-4 animate-spin", className)} aria-hidden="true" />
  );
}
