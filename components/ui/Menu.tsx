"use client";

// the trigger must NOT sit inside a horizontally scrolling container: an
// absolutely positioned panel opened from inside `overflow-x: auto` is clipped
// to the row height and opens as a 32 px strip.

import type { Route } from "next";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent as KeyboardEventReact,
  type ReactNode,
} from "react";

import { cx } from "./style";

// the reachable entries, read from the DOM in document order. `:not([disabled])`
// because an arrow key landing on a disabled command traps the keyboard there.
function entries(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
  );
}

export type MenuProps = {
  // accessible name of the trigger: it only shows three dots.
  label: string;
  // the trigger edge the panel aligns to; any other value is a no-op class.
  align?: "start" | "end";
  className?: string;
  // applied to the TRIGGER, not to the wrapper: on the wrapper a `.tooltip`
  // would also fire when the pointer crosses the open panel.
  classNameTrigger?: string;
  // the entries. `close` is passed to them and must be called.
  children: (close: () => void) => ReactNode;
};

export function Menu({
  label,
  align = "end",
  className,
  classNameTrigger,
  children,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // closes on `pointerdown`, not `click`: on the map a mousedown outside already
  // starts a pan, which would leave the panel open for the whole gesture.
  // `Escape` is captured and stopped, or one press would also cancel draw mode.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && wrapper.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    entries(panel.current)[0]?.focus();
  }, [open]);

  const onPanelKeyDown = (event: KeyboardEventReact<HTMLDivElement>) => {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }

    const list = entries(panel.current);
    if (list.length === 0) return;
    const current = list.indexOf(document.activeElement as HTMLElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      list[(current + 1) % list.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      list[(current - 1 + list.length) % list.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      list[list.length - 1]?.focus();
    }
  };

  return (
    <div ref={wrapper} className={cx("menu", className)}>
      <button
        ref={trigger}
        type="button"
        className={cx("menu__trigger", classNameTrigger)}
        aria-haspopup="menu"
        aria-expanded={open}
        // no `title`: the product tooltip already reads `aria-label`, and the
        // native bubble would stack on top of it a second later.
        aria-label={label}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        <DotsIcon />
      </button>

      {open ? (
        <div
          ref={panel}
          role="menu"
          aria-label={label}
          className={cx("menu__panel", `menu__panel--${align}`)}
          onKeyDown={onPanelKeyDown}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

// the dots are DRAWN, not typed: ellipsis characters render with the text face
// and differ from one platform to the next.
function DotsIcon() {
  return (
    <svg
      className="menu__icon"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}

// every entry carries `role="menuitem"`: that is what `entries()` looks for.
// an element in between (the sign-out `<form>`, a heading) must carry
// `role="none"` or the relationship breaks.

export type MenuButtonProps = ComponentPropsWithoutRef<"button">;

export function MenuButton({ className, type = "button", ...rest }: MenuButtonProps) {
  return (
    <button
      // without `type`, a button inside the sign-out form defaults to `submit`
      // and signs the user out.
      type={type}
      role="menuitem"
      className={cx("menu__item", "t-body-s", className)}
      {...rest}
    />
  );
}

export type MenuLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & {
  href: Route;
};

export function MenuLink({ className, ...rest }: MenuLinkProps) {
  return <Link role="menuitem" className={cx("menu__item", "t-body-s", className)} {...rest} />;
}

export function MenuHeading({
  children,
  className,
  ...rest
}: ComponentPropsWithoutRef<"p">) {
  return (
    <p role="presentation" className={cx("menu__heading", "t-micro", className)} {...rest}>
      {children}
    </p>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="menu__separator" />;
}
