"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";

import { Field } from "@/components/gate/Field";
import { Button } from "@/components/ui";

import { signInAction } from "./actions";
import { INITIAL_SIGNIN_STATE } from "./state";

import styles from "@/components/gate/gate.module.css";

export function SignIn() {
  const [state, action, inProgress] = useActionState(
    signInAction,
    INITIAL_SIGNIN_STATE,
  );
  const next = useSearchParams().get("next") ?? "";

  return (
    <form action={action} noValidate>
      {state.error ? (
        <p className={styles.alert} role="alert">
          {state.error}
        </p>
      ) : null}

      <div className={styles.fields}>
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          maxLength={320}
          // echoed back after a refusal, so a wrong password does not also
          // empty the address field
          defaultValue={state.email}
        />

        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          // the bound also exists server-side; this one is only a convenience
          maxLength={512}
        />
      </div>

      {/* Return path. Its safety is checked SERVER-side, never here. */}
      <input type="hidden" name="next" value={next} />

      <div style={{ marginTop: "24px" }}>
        <Button type="submit" ton="primary" fullWidth disabled={inProgress}>
          {inProgress ? "Checking…" : "Enter the field"}
        </Button>
      </div>
    </form>
  );
}
