"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cx } from "./style";

/**
 * A blocking confirmation: veil, centered card, Escape and a click on the
 * veil both cancel. Unlike `Stamp` this traps attention on purpose — it only
 * ever gates a step that erases something, so it must not be missable and
 * must never dismiss itself on a timer.
 */
export type ConfirmDialogProps = {
  open: boolean;
  /** The heading, and the dialog's accessible name. */
  title: string;
  children: ReactNode;
  onCancel: () => void;
  className?: string;
};

export function ConfirmDialog({
  open,
  title,
  children,
  onCancel,
  className,
}: ConfirmDialogProps) {
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Same reasoning as `Stamp`: callers write `onCancel={() => setX(false)}`, a
  // new function every render, and the effect below must not re-run for that.
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  });

  // `createPortal` needs the document, which only exists after mount.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    // Focuses the card itself, not a specific button: the caller decides
    // which of its own buttons (if any) is the safe default, this only
    // guarantees the dialog is reachable from the keyboard immediately.
    cardRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open || !mounted) return null;

  const content = (
    <div
      className="confirm-dialog"
      // The veil cancels: this dialog only ever asks "do this destructive
      // thing, or not", and a click outside it is never read as "yes".
      onClick={onCancel}
    >
      <div
        ref={cardRef}
        className={cx("confirm-dialog__card", className)}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="t-label confirm-dialog__title">{title}</p>
        {children}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
