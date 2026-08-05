"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/gate/Field";
import { Requirements } from "@/components/gate/Requirements";
import { Button } from "@/components/ui";

import { signUpAction } from "../login/actions";
import { INITIAL_SIGNUP_STATE } from "../login/state";

import styles from "@/components/gate/gate.module.css";

export type SignUpProps = {
  /** True when this is the very first account on the instance. */
  isFirstAccount: boolean;
};

export function SignUp({ isFirstAccount }: SignUpProps) {
  const [state, action, inProgress] = useActionState(
    signUpAction,
    INITIAL_SIGNUP_STATE,
  );

  // tracked as you type to feed the live requirements list; they never leave
  // this component, the form posts its own fields
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(state.email);

  return (
    <form action={action} noValidate>
      {state.error ? (
        <p className={styles.alert} role="alert">
          {state.error}
        </p>
      ) : null}

      {isFirstAccount ? (
        <p className={styles.notice}>
          This instance has no account yet. The one you create now becomes its
          owner, and everything already surveyed here belongs to it.
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
          defaultValue={state.email}
          error={state.fields.email}
          onValueChange={setEmail}
        />

        <Field
          name="displayName"
          label="Name"
          type="text"
          autoComplete="name"
          maxLength={120}
          defaultValue={state.displayName}
          error={state.fields.displayName}
          hint="Optional. It only shows in the account menu."
        />

        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          maxLength={512}
          error={state.fields.password}
          onValueChange={setPassword}
        >
          {/* Display only. checkPasswordShape on the server is authoritative. */}
          <Requirements password={password} email={email} />
        </Field>
      </div>

      <div style={{ marginTop: "24px" }}>
        <Button type="submit" ton="primary" fullWidth disabled={inProgress}>
          {inProgress ? "Creating…" : isFirstAccount ? "Claim this instance" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
