# Contributing to Towncenter

Thanks for looking. Two files matter before this one:

- [`ARCHITECTURE.md`](ARCHITECTURE.md) is the conventions file and the source of
  truth. Most of what it documents is invisible to `tsc` and to `next build`.
- [`README.md`](README.md) covers setup and what needs a Google key.

This page is the short version, plus the pull request rules.

---

## Where the product is going

Since 2026-08-04 the scope reaches past the signature: **a target you take
becomes a project that holds its documents** — quote, mockup, deliverables — and
a hosted instance is the longer-term ambition. Self-hosting stays a first-class
path under AGPL, permanently.

**None of that layer exists yet.** Five tables, zero uploaded bytes. If you are
looking for somewhere to start, that is the open ground — but read the scope
section of the README first, because two boundaries hold regardless: it is still
not a CRM, and the map is not allowed to become one view among several.

---

## Getting set up

```bash
npm install
cp .env.example .env.local     # fill AUTH_SECRET
docker compose up -d           # Postgres on port 5455
npm run db:push
npm run dev
```

---

## Running the benches

There is no test framework. Verification is three executable benches under
`scripts/`, plus the type check and the build.

```bash
npm run verify         # all three, in order
npm run verify:scoring # pure, no database needed
npm run verify:game    # pure, no database needed
npm run verify:tenancy # needs a real Postgres
npm run typecheck      # next typegen && tsc --noEmit
npm run build
```

All of `npm run typecheck`, `npm run verify` and `npm run build` must be green
before a pull request is opened. CI runs exactly those three against a real
Postgres service.

`verify:tenancy` is run against a real database on purpose. A stub client
returning empty arrays would pass every assertion in it, including against a
completely broken product.

Never run `npm run dev` as a blocking command from an automated agent.

---

## Two rules about the benches

**Any new table carrying `owner_id` joins `scripts/verify-tenancy.mts` in the
same pull request that creates it.** Tenant isolation runs through `owner_id`
and never through a role. Every exported read in `app/queries.ts` takes its
owner as its first parameter, so a call that forgets it does not compile — but
the `where` clause is checked by no compiler. That bench is the only check
standing between an account and another account's file, and **it is the only
bench whose failure is a data leak**.

**If a scoring change breaks `verify:scoring`, the scoring is wrong, never the
bench.** That bench holds five deals actually worked — two signed, one refused,
two deliberately off-grid. An algorithm that does not land on them is wrong
however elegant it is. Adjusting the expected values to match new code defeats
the entire point of keeping them.

---

## Code style

- **TypeScript, no `any`.** Prefer a narrow union over a wide type. Keys are
  string literal unions, not bare `string`.
- **Identifiers, filenames and comments are in English.**
- **Comments explain what the code cannot say by itself**: a trap, a measured
  fact, a reason for an unobvious choice. Do not narrate the line below.
- **Components are Server Components by default.** `"use client"` only where an
  interaction requires it.
- **Mutations go through Server Actions, never API routes**, and every action
  calls `requireUser()` on its first line. A Server Action is an HTTP entry
  point reachable directly, with its identifier readable in the client bundle;
  the check the page performed does not protect it.
- **Money is whole cents, ratings are whole tenths.** Never a float for money,
  anywhere.
- **Scores are recomputed on read, never stored.** Store facts, derive scores.
- **`lib/scoring.ts` stays pure**: no network, no database, no React, no clock.
  Anything that varies goes in `ScoringContext`.
- Styling is Tailwind for layout and CSS modules for components. Any CSS token
  read back by `components/map/colors.ts` must be a literal hex or `rgb()`.

---

## The interface is English, the numbers are French

Screens, buttons, error messages and price reasons are written in English.
`lib/format.ts` is pinned to `fr-FR` / `Europe/Paris` and does not move: an
amount reads `43 088 €` and a date reads in French order.

That pinning is not a preference. It is what makes the server render and the
client render produce the same string; changing it reopens a hydration mismatch
on every amount displayed. Translate its comments, never its locale.

**Keys are ASCII, labels are visible text, and the two never mix.** A short,
lowercase, space-free string is a key: URL value, storage key, `data-*`
attribute, MapLibre layer id, GeoJSON property, `rank.key`. Keys are never
translated and never accented — an accented key raises no error, it simply stops
working, and a renamed key orphans every row already in the database.

---

## Traps that pass `tsc` and pass the build

Each one cost a real bug. They are documented at length in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

1. **A `@container` never styles its own container**, only its descendants. It
   takes two elements: one measures, the other reacts.
2. **`maplibre-gl` stays on 5.x.** Version 6 emits its worker as a separate file
   Turbopack does not bundle. The map loads the style, the TileJSON and the
   sprite, then goes quiet: no tiles, no fonts, **no error**, in the console or
   on the map's `error` event. The only signal is the absence of `.pbf`
   requests. Any version bump is reviewed with that one check.
3. **In a `"use server"` module, `export type { X }` on an imported type** emits
   a runtime re-export of an identifier erased at compile time. `tsc` passes,
   the build passes, the page dies on the first click. Form state types live in
   their own files (`app/actionState.ts`, `app/login/state.ts`,
   `app/pricing/state.ts`).
4. **A media query measures the window, not the container.** A 400 px panel on a
   1440 px screen still gets the "wide" layout. Container queries, or explicit
   widths.
5. **A CSS token read by `readPalette()` must be a literal hex or `rgb()`.** An
   unregistered custom property returns `oklch(…)` verbatim from
   `getComputedStyle`, and MapLibre's colour parser ignores the layer — no
   exception, no warning.
6. **A Postgres `integer` is 32 bits**, and `rowid` does not exist. Both were
   real breakages during the SQLite to Postgres port; hence `bigint` on money
   columns and the `seq` column with `LEDGER_ORDER_DESC`.

---

## Pull requests

- One subject per pull request.
- Say what you **measured**, not what you expect. "331 businesses, 0 console
  errors" beats "should work".
- Touching the scoring: `verify:scoring` must still land on the five real deals.
- Adding a table with `owner_id`: extend `verify-tenancy.mts` in the same pull
  request.
- Changing the schema: run `npm run db:generate` and commit the generated SQL
  under `drizzle/`. Do not rely on `db:push` alone — it is a local convenience,
  while `npm start` applies the committed migrations before booting.
- Report bugs and propose features through issues. Security problems go through
  [private vulnerability reporting](https://github.com/fberrez/towncenter/security/advisories/new),
  never a public issue.

By contributing you agree that your changes are licensed under the
[GNU AGPL v3](LICENSE).

---

## What will be turned down

- A counter that climbs without a fact behind it.
- Storing a director's personal contact details.
- Storing or displaying a non-diffusible establishment.
- Keeping Google Places fields past 30 days.
- Removing or softening the "model's honesty" section on `/progression`.
- `attributionControl: false`, or a panel laid over the map attribution.
- Anything that makes one account's data visible to another.
- A percentage rendered with a decimal, or one that drops the "not calibrated"
  mention below 30 recorded outcomes.
- Treating an off-grid target as a €0 target instead of showing its written
  reason.
- **Documentation that describes the projects/documents layer as if it shipped.**
  The rule against a counter with no fact behind it applies to what we write
  about the product, not just to what it displays.
- **Anything that degrades self-hosting to make a hosted plan look better.**
- Sales-cycle stages, teams, roles or email sending. Those make it a CRM.
