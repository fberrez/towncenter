import Link from "next/link";
import type { Metadata } from "next";
import type { Route } from "next";

import { requireUser } from "@/lib/accounts";
import { getOnboardingFacts, type OnboardingFacts } from "@/app/queries";
import { Button, Badge, Card, CardHeader, CardTitle } from "@/components/ui";
import { WorldMap } from "@/components/gate/WorldMap";
import townCentre from "@/components/gate/towncenter.png";
import Image from "next/image";

import { PlacesKeyForm } from "./PlacesKeyForm";
import {
  finishOnboardingAction,
  removePlacesKeyAction,
} from "./actions";

import styles from "./onboarding.module.css";

export const metadata: Metadata = {
  title: "Configuration — Towncenter",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STEPS = ["key", "grid", "sector"] as const;
type StepKey = (typeof STEPS)[number];

function firstIncomplete(facts: OnboardingFacts): StepKey {
  if (facts.placesKeySource === null) return "key";
  if (!facts.hasCustomGrid) return "grid";
  if (facts.sectorCount === 0) return "sector";
  return "sector";
}

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const owner = await requireUser();
  const facts = await getOnboardingFacts(owner);

  const params = await props.searchParams;
  const requested = first(params.step);
  const step: StepKey =
    requested && (STEPS as readonly string[]).includes(requested)
      ? (requested as StepKey)
      : firstIncomplete(facts);

  return (
    <main className={styles.frame}>
      <div className={styles.gate}>
        <div className={styles.column}>
          <Link href="/" className={styles.brand} aria-label="Towncenter">
            <Image
              className={styles.brandMark}
              src={townCentre}
              alt=""
              priority
              placeholder="blur"
            />
            Towncenter
          </Link>

          <div className={styles.center}>
            <h1 className={styles.title}>Configurez votre territoire</h1>
            <p className={styles.subtitle}>
              Trois éléments à régler avant que la carte ne devienne utile. Chacun
              repose sur un fait mesuré : vous pouvez passer une étape et y revenir.
            </p>

            <StepRail facts={facts} current={step} />

            <div key={step} className={styles.stepContent}>
              {step === "key" ? (
                <KeyStep facts={facts} />
              ) : step === "grid" ? (
                <GridStep facts={facts} />
              ) : (
                <SectorStep facts={facts} />
              )}
            </div>
          </div>

          <div className={styles.footerRule}>
            <span>Prospection de quartier, rue par rue.</span>
          </div>
        </div>

        <div className={styles.plan} aria-hidden="true">
          <div className={styles.planFrame}>
            <WorldMap />
          </div>
        </div>
      </div>
    </main>
  );
}

type StepMeta = {
  key: StepKey;
  label: string;
  done: boolean;
};

function stepsFor(facts: OnboardingFacts): StepMeta[] {
  return [
    { key: "key", label: "Connecter Google Places", done: facts.placesKeySource !== null },
    { key: "grid", label: "Vérifier votre grille tarifaire", done: facts.hasCustomGrid },
    { key: "sector", label: "Relever votre premier secteur", done: facts.sectorCount > 0 },
  ];
}

function StepRail({ facts, current }: { facts: OnboardingFacts; current: StepKey }) {
  const steps = stepsFor(facts);
  return (
    <ol className={styles.rail}>
      {steps.map((s, i) => {
        const isCurrent = s.key === current;
        return (
          <li
            key={s.key}
            className={styles.railItem}
            data-done={s.done ? "" : undefined}
            data-current={isCurrent ? "" : undefined}
          >
            <Link
              href={`/onboarding?step=${s.key}` as Route}
              className={styles.railLink}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className={styles.railNumber}>
                {s.done ? <Check /> : i + 1}
              </span>
              <span className={styles.railLabel}>{s.label}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5 6.5 12 13 4" />
    </svg>
  );
}

function KeyStep({ facts }: { facts: OnboardingFacts }) {
  if (facts.placesKeySource === "env") {
    return (
      <>
        <Badge asChild><h2>Google Places</h2></Badge>
        <p className="t-body">
          La clé est fournie par l’environnement du serveur
          (<code>GOOGLE_PLACES_API_KEY</code>). Vous n’avez rien à faire ici.
        </p>
        <Link href="/onboarding?step=grid" className={styles.stepLink}>
          Continuer →
        </Link>
      </>
    );
  }

  if (facts.placesKeySource === "account") {
    return (
      <>
        <Badge asChild><h2>Google Places</h2></Badge>
        <p className="t-body">
          Votre clé est configurée : <code>{facts.placesKeyMask}</code>.
        </p>
        <form action={removePlacesKeyAction} className={styles.removeForm}>
          <Button type="submit" variant="quiet" size="compact">
            Supprimer la clé
          </Button>
        </form>
        <Link href="/onboarding?step=grid" className={styles.stepLink}>
          Continuer →
        </Link>
      </>
    );
  }

  return (
    <>
      <Badge asChild><h2>Google Places</h2></Badge>
      <p className="t-body">
        L’enrichissement nécessite une clé d’API Google Places. Sans elle, la carte
        fonctionne toujours — le relevé, le score et le journal n’ont besoin d’aucune
        clé — mais aucune entreprise n’obtiendra d’adresse de site web et l’audit de
        site interne n’aura rien à analyser.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Votre clé</CardTitle>
        </CardHeader>
        <PlacesKeyForm />
        <p className="t-body-s tone-3">
          Stockée sur cette instance et utilisée uniquement côté serveur. Une requête
          facturée est effectuée lorsque vous cliquez sur « Vérifier la clé ».
        </p>
      </Card>
      <Link href="/onboarding?step=grid" className={styles.stepLink}>
        Passer cette étape →
      </Link>
    </>
  );
}

function GridStep({ facts }: { facts: OnboardingFacts }) {
  return (
    <>
      <Badge asChild><h2>Grille tarifaire</h2></Badge>
      <p className="t-body">
        Tous les montants de la carte proviennent de votre grille : le butin d’une
        cible, le trésor d’un secteur, le rang d’une entreprise. La grille par défaut
        est fournie avec le produit : les tarifs réels d’un indépendant, comme point de départ.
      </p>
      {facts.hasCustomGrid ? (
        <p className="t-body-s tone-2">
          Vous avez déjà enregistré une grille personnalisée.
        </p>
      ) : (
        <p className="t-body-s tone-2">
          Vous utilisez la grille par défaut. Ouvrez la page de tarification pour la
          modifier, ou conservez-la et continuez.
        </p>
      )}
      <div className={styles.stepActions}>
        <Link href="/pricing" className={styles.stepLink}>
          Ouvrir la page de tarification
        </Link>
        <Link href="/onboarding?step=sector" className={styles.stepLink}>
          {facts.hasCustomGrid ? "Continuer →" : "Conserver la grille par défaut →"}
        </Link>
      </div>
    </>
  );
}

function SectorStep({ facts }: { facts: OnboardingFacts }) {
  return (
    <>
      <Badge asChild><h2>Premier secteur</h2></Badge>
      <p className="t-body">
        Dessinez un secteur sur la carte. Il se remplit de toutes les entreprises qui y
        sont réellement enregistrées — le registre national français les connaît, et il
        est gratuit, sans clé. Chacune devient une cible avec deux valeurs : le butin et
        la résistance.
      </p>
      {facts.sectorCount > 0 ? (
        <p className="t-body-s tone-2">
          Vous avez déjà relevé {facts.sectorCount} secteur
          {facts.sectorCount === 1 ? "" : "s"}.
        </p>
      ) : null}
      <form action={finishOnboardingAction}>
        <Button type="submit" variant="primary" fullWidth>
          {facts.sectorCount > 0 ? "Retour à la carte" : "Accéder à la carte"}
        </Button>
      </form>
    </>
  );
}
