# Working on this repository with an AI assistant

The conventions file is [`ARCHITECTURE.md`](ARCHITECTURE.md). Read it before
changing code: most of what it documents is invisible to `tsc` and to
`next build`.

Then [`CONTRIBUTING.md`](CONTRIBUTING.md) for the benches and the pull request
rules.

## Comments

One line maximum, and only when the code cannot say it itself. No paragraph, no
block of explanation: if a rule needs more than a line, it belongs in
`ARCHITECTURE.md`. This applies to new comments; the existing multi-line blocks
are left alone until the code around them is rewritten.

## Two things that only matter to an automated agent

- Never run `npm run dev` as a blocking command.
- `npm run typecheck` runs `next typegen`, which writes to `.next/`. Use
  `npx tsc --noEmit` when a read-only check is enough.
