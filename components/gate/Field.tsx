"use client";

// One gate field: label above, error below, tied together by
// `aria-describedby` so a screen reader announcing the field also says what is
// wrong with it.

import { useId, useState } from "react";

import styles from "./field.module.css";

export type FieldProps = {
  name: string;
  label: string;
  type?: "email" | "password" | "text";
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  maxLength?: number;
  defaultValue?: string;
  /** The error message for this field. Visible text. */
  error?: string;
  /** A permanent hint under the field. Never a reproach. */
  hint?: string;
  /** Rendered under the field: the live requirements list, for instance. */
  children?: React.ReactNode;
  onValueChange?: (value: string) => void;
};

export function Field({
  name,
  label,
  type = "text",
  autoComplete,
  autoFocus,
  required,
  maxLength,
  defaultValue,
  error,
  hint,
  children,
  onValueChange,
}: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [visible, setVisible] = useState(false);

  const isPasswordField = type === "password";
  const actualType = isPasswordField && visible ? "text" : type;

  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>

      <div className={styles.box} data-error={error ? "" : undefined}>
        <input
          id={id}
          name={name}
          type={actualType}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          maxLength={maxLength}
          defaultValue={defaultValue}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy === "" ? undefined : describedBy}
          onChange={
            onValueChange ? (event) => onValueChange(event.target.value) : undefined
          }
        />

        {isPasswordField ? (
          <button
            // `type="button"`: without it, clicking the eye SUBMITS the form.
            type="button"
            className={styles.eye}
            onClick={() => setVisible((state) => !state)}
            aria-pressed={visible}
            aria-label={visible ? "Hide password" : "Show password"}
          >
            <Eye bar={visible} />
          </button>
        ) : null}
      </div>

      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}

      {children}

      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Eye({ bar }: { bar: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.6" />
      {bar ? <path d="M4 20 20 4" /> : null}
    </svg>
  );
}
