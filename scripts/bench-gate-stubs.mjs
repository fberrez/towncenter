// bench-only stubs for `next/navigation` and `next/headers`. the session is
// ALWAYS valid: the bench measures what the actions do once past the gate, and
// the gate itself is verified elsewhere, on real requests.

import { SignJWT } from "jose";

const SESSION_COOKIE = "towncenter_session";
const SECRET = process.env.AUTH_SECRET ?? "bench-only-secret-of-at-least-thirty-two-chars";

// pinned here so `lib/auth.ts` signs and verifies with the same value.
process.env.AUTH_SECRET = SECRET;

let token = null;

async function benchToken() {
  if (token) return token;
  const emittedAt = Math.floor(Date.now() / 1000);
  token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setIssuer("towncenter")
    .setAudience("towncenter-app")
    .setIssuedAt(emittedAt)
    .setExpirationTime(emittedAt + 3600)
    .sign(new TextEncoder().encode(SECRET));
  return token;
}

export async function cookies() {
  const value = await benchToken();
  const box = new Map([[SESSION_COOKIE, { name: SESSION_COOKIE, value: value }]]);

  return {
    get: (name) => box.get(name),
    set: (name, val) => box.set(name, { name: name, value: val }),
    delete: (name) => box.delete(name),
    has: (name) => box.has(name),
  };
}

export async function headers() {
  return new Headers();
}

// throws like the real `redirect()`, which raises a control-flow error: a stub
// returning undefined would let the action run on with no session.
export function redirect(path) {
  throw new Error(
    `[bench] redirect(${path}) reached: the bench gate should have opened.`,
  );
}

export function notFound() {
  throw new Error("[bench] notFound() reached.");
}

export function permanentRedirect(path) {
  return redirect(path);
}
