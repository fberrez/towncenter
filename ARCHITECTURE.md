# Architecture and conventions

This file documents the constraints a contributor would otherwise break. Most of
them are invisible to `tsc` and to `next build`: the code compiles, the build
passes, and the product is quietly wrong. Read this before changing anything
under `lib/`, `app/` or `components/`.

For how to run the project and how to open a pull request, see
[`README.md`](README.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## What the product does

You draw a sector on a map. It fills with the businesses registered there, taken
from the French national company register. Each business becomes a **target**
carrying two numbers: the **loot** (what you would earn if it signed) and the
**resistance** (what stands between you and that signature). You approach, you
engage, you take.

The map is the product. Every game element is backed by a measured fact: the
loot is an amount from a price grid the operator actually charges, the
resistance comes from the state of the website, the footfall and the ability to
pay. Progress is logged at the moment of the fact and never recomputed. A
counter that climbs without a fact behind it does not belong here.

The `/progression` screen carries a section named **The model's honesty** that
compares what the model predicted with what actually happened. Do not remove it
and do not soften it: it exists so the model can be wrong in public.

---

## Where the product is going, and what that repeals

**Since 2026-08-04: a target you take no longer leaves the game, it becomes a
project that holds its documents** — the quote, the mockup you show the client,
the deliverables. Finding the deal and delivering it are the same job; splitting
them across two tools means typing the same client twice. Further out, **a
hosted instance**: self-hosting stays a first-class path under AGPL,
permanently, but there will be an option for people who do not want to run a
Postgres.

> [!WARNING]
> The previous rule said the exact opposite, and it is **repealed**: "a target
> once taken leaves the game; what happens afterwards — the quote, the meetings,
> the deliverables — is handled elsewhere. The bridge does not exist yet and is
> not urgent." Do not reinstate it believing you are correcting a scope drift:
> it is a decision, and it is dated.

**None of that layer is built.** Six tables — `users`, `targets`, `zones`,
`events`, `price_grids`, `account_settings` — and **zero stored bytes**: no object storage, no blob
column, no multipart handler. The rule against a counter with no fact behind it
applies to what we write *about* the product too: until a table exists, the docs
say "to be built", not "coming soon". The day it ships, the mention goes and the
table joins the lists.

**Three things do not move with the widening:**

- **It is still not a CRM**, and it will not become one. No sales cycles, no
  teams, no roles, no email sending, no importing a bought list. The line is
  sharp: a quote attached to a project is a **document**; a configurable
  pipeline with stages is a CRM.
- **The map stays the product.** Projects are reached **from** a target you
  took; they are not a parallel tab. The day the map becomes one view among
  several, this is a worse version of software that already exists.
- **Any new table carrying `owner_id` joins `scripts/verify-tenancy.mts` in the
  same pull request that creates it.** On a hosted, paid instance, a failure of
  that bench stops being a bug and becomes an incident to disclose.

---

## Stack and layout

Next.js 16 (App Router, React 19, Server Components), TypeScript, Drizzle ORM on
Postgres 16, MapLibre GL 5 with OpenFreeMap tiles, Tailwind 4 plus CSS modules.
Node 22 or later. No test framework: verification is three executable benches
under `scripts/`.

| Path | What lives there |
|---|---|
| `app/` | Routes, Server Actions (`actions.ts`), all reads (`queries.ts`) |
| `components/map/` | The map, the target sheet, the sector panel, field and fact inventories |
| `components/game/` | HUD, clusters, XP and level surfaces |
| `components/ui/` | Shared primitives, including the provenance registry `Source.tsx` |
| `lib/scoring.ts` | Price and probability. Pure. |
| `lib/game.ts` | Ranks, rarity, XP, levels, streaks, seasons |
| `lib/priceGrid.ts` | `DEFAULT_PRICE_GRID` and its validation schema |
| `lib/sources/` | SIRENE, IGN geocoder, Google Places, in-repo site audit |
| `lib/db/schema.ts` | The six tables and their indexes |
| `scripts/verify-*.mts` | The benches |

---

## Numbers

**Every amount is in whole cents.** Never a float for money, anywhere: not in
the database, not in a type, not in an intermediate computation. Ratings are in
whole tenths (`46` is 4.6). Same discipline, same reason.

**A Postgres `integer` is 32 bits.** Revenue figures from the register exceed
that ceiling by an order of magnitude on real data, which is why
`revenue_cents` and `net_income_cents` are `bigint`. Any new money column is
`bigint` until proven otherwise.

**Percentages never render with a decimal.** They are rounded to a step of 5
(`PERCENT_ROUNDING_STEP` in `lib/scoring.ts`) and carry the mention
`Estimate not calibrated (n = X)` for as long as fewer than
`CALIBRATION_MIN_OUTCOMES` (30, in `lib/types.ts`) real outcomes are recorded. An estimate built on
a handful of facts does not have three significant digits, and showing three is
a promise of precision the model cannot keep.

The percentage in the target sheet header is also the button that opens the
factor-by-factor breakdown in the **Facts** tab. A number nobody can explain
will not be believed, so never put the calculation out of reach of the number
that came from it.

---

## Scoring

**`lib/scoring.ts` is a pure function.** No network, no database, no React, no
clock. Everything that varies per account or per run arrives through
`ScoringContext`: the outcome count, the price grid, the reference date, and the
recalibrated base probability. That purity is what keeps
`scripts/verify-scoring.mts` runnable with no database at all.

**The score is never read from the database, it is recomputed on read.** Facts
are stored, scores are derived. That is what allows the model to be recalibrated
without a migration the day thirty real outcomes are known. The one thing that
is stored and never recomputed is logged **progress**, because a total that
moves on its own is exactly what turns an instrument into a casino.

**The price grid is data, not a constant, and each account carries its own.**
The type is `PriceGrid` in `lib/types.ts`, the documented default is
`DEFAULT_PRICE_GRID` in `lib/priceGrid.ts`, the per-account row lives in
`price_grids` (primary key `owner_id`, one row per account) and it reaches
scoring through `ScoringContext.grid`. A missing row is not an error, it is the
normal state of a fresh account, which plays on the default; `/pricing` writes
the row on first save.

**An off-grid target is not a €0 target.** When online sales are detected, or
the company runs more than five establishments, the price stops being derivable
from the grid and the reason is written out in full. Those are often the best
deals in the file. Never let them sink to the bottom of a sort as if they were
worthless, and never replace the written reason with a zero.

---

## The game layer

**The benchmark scale follows the grid, and that is not optional.** The five
ranks are fractions of the default deal — `standardDealCents(grid)`, a full site
plus the horizon times the recurring fee. An account charging twice as much
would otherwise see every single target land in the top rank; measuring one
seller's deals with another seller's ruler classifies nothing. Hence
`ranksFor(grid)`, `rarityOf(score, count, grid)` and `xpFor(kind, score, grid)`,
all defaulting to `DEFAULT_PRICE_GRID` so benches and legends can read the
reference scale without passing anything.

Streaks count **Europe/Paris** days, not UTC days (`dayKeyParis` in
`lib/game.ts`). A deal closed at 00:30 Paris time belongs to the day the
operator thinks it does.

---

## Interface conventions

**The interface is in English; amounts and dates stay French-formatted.**
Screens, buttons, price reasons, error messages and the prompt template are all
English. `lib/format.ts` is pinned to `fr-FR` / `Europe/Paris` and **does not
move**: the businesses are French, the prices come from a French grid, and the
locale is frozen so that server render and client render produce the *same*
string. Changing it reopens a hydration mismatch on every amount displayed. An
amount reads `43 088 €`, with the narrow no-break space `Intl` produces. The
only French words left visible are proper nouns: streets, towns, trade names.

**Keys are ASCII, labels are visible text, and the two never mix.** A short,
lowercase, space-free string is a *key*: URL value, storage key, `data-*`
attribute, MapLibre layer id, GeoJSON property, `rank.key`, `FactKey`,
`SourceKey`. Keys are never translated and never accented. An accented or
translated key raises no error, it simply stops working — and a renamed key
orphans every row already written to the database.

**Every displayed datum states where it came from, and "computed" counts.** The
registry is `components/ui/Source.tsx`: five ASCII keys — `sirene`, `google`,
`audit`, `log`, `computed` — each with its pictogram and its legend entry.
`TargetFact.sources` is an **array of keys**, never free text; when it was free
text it drifted, and the same public register got written three different ways
across four facts. `computed` is deliberately in the list even though it is not
a source: loot and resistance are measured nowhere, and on a screen where
everything carries a mark, leaving them bare would make them look measured. **The
badge shows even when the statistic is empty** — an empty row raises exactly one
question, which is who should have filled it. The pictograms are drawn in-repo
and are told apart by their **shape**: the palette has a single blue, and a
coloured mark would be the only splash on the screen, pulling the eye to the
provenance instead of the figure.

**An empty field is the action that fills it, never a dead row.** The cell reads
`Set the website…` or `No accounts filed`. `components/map/fields.ts` holds the
inventory: every field yields a `FieldAction` — `api` (enrichment would fill
it), `input` (only you can), `resurvey` (a re-harvest of the sector might), or
`none` with its **reason written out in full**. A "nothing to do" is not
clickable and must not look like it: offering a button to fetch a revenue figure
the register declares unfiled makes people click into the void, indefinitely.

The target sheet has a fixed header and three tabs — Approach, Facts, Log.

---

## Manual entry versus Google fields

**Hand-typed values do not live in `phone` and `website_url`.** Those two
columns are purged at 30 days by `purgeStaleGoogleFacts()`: an address typed by
hand would vanish on its own a month later, silently, and the audit it triggered
would become impossible to redo. Worse, it would be destroyed **under Google's
terms**, which never supplied it.

Manual values live in `manual_website_url` / `manual_phone`, never expire, and
**win over Google on read** — if the operator typed something, Google was silent
or wrong. Writing a website resets `auditedAt` and `siteAudit` to `null`,
otherwise the audit would never rerun and the screen would show the new address
above findings about the old one.

---

## Data model, database and tenancy

Six tables: `users`, `targets`, `zones`, `events`, `price_grids`, `account_settings`.

**`rowid` does not exist in Postgres.** Two reads relied on it to break ties
between two facts written in the same second. Without a tiebreak, "roll back"
deletes the site audit instead of the phone call, and nothing signals it. Hence
the `seq` column (a strict sequence) and `LEDGER_ORDER_DESC`, **defined once in
the schema**: the ledger *displays* what the rollback *deletes*, and two copies
of the same ordering expression would eventually diverge.

**Every account carries its own territory, and isolation runs through
`owner_id`, never through a role.** Every exported read in `app/queries.ts`
takes its owner as its **first parameter**: a call that forgets it does not
compile. The `where` clause, however, is checked by no compiler — that is what
`scripts/verify-tenancy.mts` is for, and **it is the only bench whose failure is
a data leak**. Any new table carrying `owner_id` joins that bench in the same
pull request that creates it.

---

## Server Actions and routing

**Mutations go through Server Actions, never API routes.** Every action calls
`requireUser()` on its **first line**. A Server Action is an HTTP entry point
reachable directly, with its identifier readable in the client bundle; the check
the page performed does not protect it.

**The Next 16 convention here is `proxy.ts`, not `middleware.ts`.** Do not
recreate a `middleware.ts`.

The first account created owns the instance and closes signups; only
`ALLOW_SIGNUPS` reopens them.

---

## Five traps that pass `tsc` and pass the build

**1. A `@container` never styles its own container**, only its descendants.
Putting `container-type` on the element you want to react gives you a rule that
never applies — no error, no warning. It takes two elements: one measures, the
other reacts.

**2. `maplibre-gl` stays on 5.x.** Version 6 emits its worker as a separate file
(`dist/maplibre-gl-worker.mjs`) that Turbopack does not emit. The main thread
loads the style, the TileJSON and the sprite, then goes quiet. No tiles, no
fonts, **no error** — not in the console, not on the map's `error` event. The
only signal is the *absence* of `.pbf` requests in the network tab. Any version
bump is reviewed with that single check: open the map and confirm a tile
actually leaves. API corollary: `setData` is synchronous in 5 and returns a
promise in 6.

**3. In a `"use server"` module, `export type { X }` on an imported type**
emits a runtime re-export of an identifier erased at compile time. `tsc` passes,
the build passes, the page dies on the first click. That is why form state types
live in their own files: `app/actionState.ts`, `app/login/state.ts`,
`app/pricing/state.ts`.

**4. A media query measures the WINDOW, not the container.** A 400 px panel on a
1440 px screen still receives the "wide" layout and crushes flexible fields to
zero pixels. Use container queries, or explicit widths.

**5. A CSS token read back by `components/map/colors.ts` must be a literal hex
or `rgb()`.** `readPalette()` reads thirteen tokens with `getComputedStyle` and
passes them **as they are** to MapLibre. An unregistered custom property does
not compute its functions: `getComputedStyle` returns the string
`oklch(0.47 0.175 258)` or `color-mix(…)` verbatim, and MapLibre's colour parser
knows neither. The layer is then ignored — no exception, no warning, nothing in
the console. Keep the original OKLCH values in a comment and give the token the
hex.

---

## Data sources, and what may not be done with them

The primary source is **`recherche-entreprises.api.gouv.fr`**: free, no key.
Four traps are handled in `lib/sources/sirene.ts`, each verified against real
calls:

- `near_point` returns a company as soon as *any* of its establishments touches
  the radius. Filter on `matching_etablissements`, **never** on `siege`.
- Latitude and longitude come back as **strings**.
- `dirigeants[]` includes statutory auditors, not only directors.
- `statut_diffusion` other than `"O"` means the right to object was exercised.

**A non-diffusible establishment is neither stored nor displayed.** That is not
an edge case, it is someone who asked not to appear.

**No personal contact details of a director are stored.** The name and the role
are enough; you call the establishment's own line.

**Google Places is required by enrichment, and by nothing else.** Without
`GOOGLE_PLACES_API_KEY` the two enrichment actions refuse to run and say what to
do. Everything else is free and key-less and stays that way: the SIRENE harvest,
the directors, the IGN geocoding, the map, the scoring, the ledger.

There is no working key-less mode, and claiming one would be false.
`targets.website_url` is written in exactly one place, from Google Places'
`websiteUri`; neither the register nor the geocoder returns a website. Without a
key no business ever gets an address, so the in-repo site audit never has
anything to audit. Measured on a real 331-business frame:
`0 enriched · 0 remaining · 772 with nothing to query`. Restoring a genuine
key-less mode needs a free source of URLs first — OpenStreetMap via Overpass
carries one for roughly 21 % of the shops in a frame (103 out of 488, measured
in Puteaux).

**Google's terms allow only `place_id` to be kept indefinitely.** Rating, review
count, opening hours and price level expire at thirty days: they carry a fetch
timestamp, are hidden on read past that window, and are then purged
(`lib/retention.ts`). This is a contractual obligation, not a setting.

**Tile attribution is a licensing obligation, not decoration.** Never pass
`attributionControl: false`, and never lay a panel over the attribution.

---

## Benches

```bash
npm run verify       # scoring, game, tenancy
npm run typecheck    # next typegen && tsc --noEmit
npm run build
```

| Bench | What it proves |
|---|---|
| `verify:scoring` | The algorithm lands on **five deals actually worked** — two signed, one refused, two deliberately off-grid — then on two orderings and eleven invariants. |
| `verify:game` | Rank follows expected value, taking a bigger business is worth more, the second tier lands exactly at the end of a first deal, and streaks count Europe/Paris days. |
| `verify:tenancy` | Every exported read returns only its owner's rows. **The only bench whose failure is a data leak.** |

`verify:tenancy` needs a real Postgres. A stub client returning empty arrays
would pass every assertion in it, including against a completely broken product.

**If a scoring change breaks `verify:scoring`, the scoring is wrong, never the
bench.**

---

## Deployment notes

Any Node 22 host with a Postgres database. `npm start` runs the migrations
(`scripts/migrate.mjs`) **before** booting and exits on failure: a refused
deployment beats a database in an uncertain schema state.

> **The database connection accessor stays lazy.** Under SQLite an accidental
> build-time pool raised `SQLITE_BUSY` — loud. Postgres says nothing: the build
> takes connections on the production database at every deployment and never
> returns them. On a managed instance capped at 20 connections, a few builds in
> a row hand `FATAL: too many clients already` to real users.

Required variables: `AUTH_SECRET` (32 characters minimum), `DATABASE_URL`, and
`GOOGLE_PLACES_API_KEY`. Optional: `ALLOW_SIGNUPS`. See
[`.env.example`](.env.example).

**No secret is ever copied into a tracked file.** `.env*.local` is gitignored.
