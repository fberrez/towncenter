// Resolution hook: `next/navigation` and `next/headers` point at the bench
// stubs. A `resolve` hook runs on its own thread and shares nothing with the
// program; it only rewrites a specifier and never runs product code.

const REPLACED = new Set(["next/navigation", "next/headers"]);

export async function resolve(specifier, context, next) {
  if (!REPLACED.has(specifier)) {
    return next(specifier, context);
  }

  return {
    shortCircuit: true,
    url: new URL("./bench-gate-stubs.mjs", import.meta.url).href,
  };
}
