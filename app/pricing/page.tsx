import type { Route } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui";
import { requireUser } from "@/lib/accounts";
import type { ScoringFacts } from "@/lib/types";

import { getPriceGrid } from "../queries";
import { PriceGridForm } from "./PriceGridForm";
import { ResetGrid } from "./ResetGrid";

import "./pricing.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tarification · Towncenter",
};

// Invented businesses, and they must stay invented: this screen has to give the
// SAME result for everyone, otherwise two people comparing grids would in fact
// be comparing two businesses. One per step, each chosen so it triggers the
// offer that step sets — a witness the step cannot move is a dead number.
const COMMON = {
  companyCreatedAt: null,
  revenueCents: null,
  financesYear: null,
  employeeRange: null,
  companyCategory: null,
  priceLevel: null,
  hasPhone: true,
  hasContactForm: false,
  directorCount: 1,
  proximity: "in-zone" as const,
  isOpen: true,
  isDiffusible: true,
  isFranchiseGroupSite: false,
};

const WITNESSES: Record<string, { who: string; facts: ScoringFacts }> = {
  baseCents: {
    who: "Une jeune boutique · 12 avis · aucun site web · aucune photo exploitable",
    facts: {
      ...COMMON,
      openEstablishmentCount: 1,
      ratingTenths: 44,
      reviewCount: 12,
      site: { issue: "no_known_site", usablePhotos: false },
    },
  },
  fullSiteCents: {
    who: "Une boutique typique · une adresse · 235 avis · aucun site web",
    facts: {
      ...COMMON,
      openEstablishmentCount: 1,
      ratingTenths: 49,
      reviewCount: 235,
      site: { issue: "no_known_site" },
    },
  },
  multiPageCents: {
    who: "Un restaurant · un site de neuf pages inaccessible · 180 avis",
    facts: {
      ...COMMON,
      openEstablishmentCount: 1,
      ratingTenths: 47,
      reviewCount: 180,
      site: { issue: "site_unreachable", sitemapUrlCount: 9 },
    },
  },
  multiAddressCents: {
    who: "Une chaîne de trois boutiques · un propriétaire · aucun site web",
    facts: {
      ...COMMON,
      openEstablishmentCount: 3,
      ratingTenths: 46,
      reviewCount: 410,
      site: { issue: "no_known_site" },
    },
  },
  recurringBaseCents: {
    who: "Une boutique typique · une adresse · 235 avis · aucun site web",
    facts: {
      ...COMMON,
      openEstablishmentCount: 1,
      ratingTenths: 49,
      reviewCount: 235,
      site: { issue: "no_known_site" },
    },
  },
};

export default async function PricingPage() {
  const owner = await requireUser();
  const grid = await getPriceGrid(owner);

  return (
    <main className="pricing">
      <header className="pricing__head">
        <Badge asChild><h2>Tarification</h2></Badge>
        <div className="pricing__head-act">
          <ResetGrid />
          <Link className="t-body-s pricing__back" href={"/" as Route}>
            {"Retour à la carte"}
          </Link>
        </div>
      </header>

      <PriceGridForm grid={grid} witnesses={WITNESSES} />
    </main>
  );
}
