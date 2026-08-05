import type { ReactNode } from "react";

import { Tag } from "./Tag";
import { cx } from "./style";

// the panel declares `container-type: inline-size` and every layout breakpoint
// in the system is written as `@container panel (...)`: a media query would
// measure the window, not the panel.
export type PanelProps = {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
  /** no background, no border: keeps only the container and the rhythm. */
  bare?: boolean;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
};

export function Panel({
  children,
  title,
  action,
  bare = false,
  className,
  as: As = "section",
}: PanelProps) {
  return (
    <As className={cx("panel", bare && "panel--bare", className)}>
      {(title || action) && (
        <header className="panel__head">
          {title ? (
            <Tag as="h2" className="panel__title">
              {title}
            </Tag>
          ) : (
            <span />
          )}
          {action}
        </header>
      )}
      {children}
    </As>
  );
}
