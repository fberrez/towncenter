import type { ComponentPropsWithRef } from "react";

import { cx } from "./style";

// `ComponentPropsWithRef` rather than `ButtonHTMLAttributes`: in React 19 `ref`
// is an ordinary prop, and `Stamp` needs it to focus its close button.
export type ButtonProps = ComponentPropsWithRef<"button"> & {
  ton?: "primary" | "secondaire" | "discret";
  size?: "normale" | "compacte";
  fullWidth?: boolean;
};

export function Button({
  ton = "secondaire",
  size = "normale",
  fullWidth = false,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      // A button with no explicit `type` inside a form defaults to `submit` and
      // submits on the first click. Always default to `button`.
      type={type}
      className={cx(
        "button",
        `button--${ton}`,
        size === "compacte" && "button--compact",
        fullWidth && "button--full",
        className,
      )}
      {...rest}
    />
  );
}
