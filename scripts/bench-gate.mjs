// registers bench-only stubs for `next/navigation` and `next/headers`, loaded
// through `--import` in `verify:tenancy`. NEVER import it from `app/`, `lib/`
// or `components/`: it hands out a valid session.

import { register } from "node:module";

register("./bench-gate-hooks.mjs", import.meta.url);
