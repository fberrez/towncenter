import { createElement, type ReactNode } from "react";

import { cx } from "./style";

/** The gutter label: wide-tracked capitals in the monospace face. */
export type TagProps = {
  children: ReactNode;
  /** `label` 10.5 px (default) or `micro` 9.5 px, for chips and badges. */
  size?: "label" | "micro";
  ton?: "secondaire" | "primaire" | "accent";
  /** The element rendered. `span` by default: a label is not a heading. */
  as?: "span" | "div" | "p" | "h2" | "h3";
  className?: string;
};

export function Tag({
  children,
  size = "label",
  ton = "secondaire",
  as = "span",
  className,
}: TagProps) {
  return createElement(
    as,
    {
      className: cx(
        size === "micro" ? "t-micro" : "t-label",
        ton === "primaire" ? "tone-1" : ton === "accent" ? "tone-accent" : "tone-2",
        className,
      ),
    },
    children,
  );
}
