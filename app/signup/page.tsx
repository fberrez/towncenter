import Link from "next/link";
import type { Metadata } from "next";

import { Gate } from "@/components/gate/Gate";
import { redirect } from "next/navigation";

import { signupState, getUser } from "@/lib/accounts";

import { SignUp } from "./SignUpForm";

import styles from "@/components/gate/gate.module.css";

export const metadata: Metadata = {
  title: "Create an account — Towncenter",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  // same rule as /login: the database decides, not the token signature
  if (await getUser()) redirect("/");

  const state = await signupState();

  // Closed, the page still exists and says why. A 404 would be quieter and
  // worse: whoever was given the address would hunt a broken link. This is
  // self-hosted software, and the reader is often the one who can act.
  if (!state.open) {
    return (
      <Gate
        title="Accounts are closed"
        subtitle="This instance is not taking new accounts right now."
        toggle={
          <Link href="/login" className={styles.link}>
            Back to sign in
          </Link>
        }
      >
        <p className={styles.notice}>{state.reason}</p>
      </Gate>
    );
  }

  return (
    <Gate
      title={state.isFirstAccount ? "Claim this instance" : "Create your account"}
      subtitle={
        state.isFirstAccount
          ? "You are the first here. This account will own the territory."
          : "One account, one territory. Nothing is shared between them."
      }
      toggle={
        state.isFirstAccount ? null : (
          <>
            Already have an account?{" "}
            <Link href="/login" className={styles.link}>
              Sign in
            </Link>
          </>
        )
      }
    >
      <SignUp isFirstAccount={state.isFirstAccount} />
    </Gate>
  );
}
