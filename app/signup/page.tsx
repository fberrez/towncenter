import Link from "next/link";
import type { Metadata } from "next";

import { Gate } from "@/components/gate/Gate";
import { redirect } from "next/navigation";

import { signupState, getUser } from "@/lib/accounts";

import { SignUp } from "./SignUpForm";

import styles from "@/components/gate/gate.module.css";

export const metadata: Metadata = {
  title: "Créer un compte — Towncenter",
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
        title="Les comptes sont fermés"
        subtitle="Cette instance n’accepte pas de nouveaux comptes actuellement."
        toggle={
          <Link href="/login" className={styles.link}>
            Retour à la connexion
          </Link>
        }
      >
        <p className={styles.notice}>{state.reason}</p>
      </Gate>
    );
  }

  return (
    <Gate
      title={state.isFirstAccount ? "Prendre possession de cette instance" : "Créer votre compte"}
      subtitle={
        state.isFirstAccount
          ? "Vous êtes la première personne ici. Ce compte possédera le territoire."
          : "Un compte, un territoire. Rien n’est partagé entre eux."
      }
      toggle={
        state.isFirstAccount ? null : (
          <>
            Vous avez déjà un compte ?{" "}
            <Link href="/login" className={styles.link}>
              Se connecter
            </Link>
          </>
        )
      }
    >
      <SignUp isFirstAccount={state.isFirstAccount} />
    </Gate>
  );
}
