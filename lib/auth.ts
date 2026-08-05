// Session token and cookie, nothing else. `proxy.ts` imports this module, so it
// runs in the Edge runtime and may depend only on `jose` and `next/headers`.
// Adding `node:crypto`, the `postgres` driver or `@/lib/db` breaks the whole app.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "towncenter_session";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const ISSUER = "towncenter";
const AUDIENCE = "towncenter-app";
const ALGORITHM = "HS256";

export type Session = {
  sub: string; // users.id
  iat: number;
  exp: number;
};

// read at call time, never at import: at import a rotated secret would only take
// effect on the next restart, and a missing one would fail the build.
function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET is missing or too short (32 characters minimum).");
  }
  return new TextEncoder().encode(secret);
}

// Brute-force throttle, counted PER EMAIL ADDRESS and never globally: a global
// counter locks everyone out after ten deliberate failures on an invented
// address. In memory, so per instance and reset on restart.

const MAX_FAILURES = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

// cap so a bot cannot grow process memory; the oldest entry is dropped.
const MAX_TRACKED = 5_000;

const attempts = new Map<string, { failures: number; lastFailure: number }>();

function throttleKey(email: string): string {
  const cleaned = email.trim().toLowerCase();
  return cleaned === "" ? "?" : cleaned;
}

export function loginAttemptAllowed(email: string): boolean {
  const entry = attempts.get(throttleKey(email));
  if (!entry || entry.failures < MAX_FAILURES) return true;

  if (Date.now() - entry.lastFailure > LOCKOUT_MS) {
    attempts.delete(throttleKey(email));
    return true;
  }
  return false;
}

export function registerLoginFailure(email: string): void {
  const key = throttleKey(email);

  if (!attempts.has(key) && attempts.size >= MAX_TRACKED) {
    const oldest = attempts.keys().next().value;
    if (oldest !== undefined) attempts.delete(oldest);
  }

  const entry = attempts.get(key) ?? { failures: 0, lastFailure: 0 };
  entry.failures += 1;
  entry.lastFailure = Date.now();
  attempts.set(key, entry);
}

export function registerLoginSuccess(email: string): void {
  attempts.delete(throttleKey(email));
}

export async function signSessionToken(userId: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_MAX_AGE_SECONDS)
    .sign(getAuthSecret());
}

// never throws: `proxy.ts` calls it on every request, including with a missing,
// truncated or forged cookie.
export async function verifySessionToken(
  token: string | undefined,
): Promise<Session | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
    });

    if (typeof payload.sub !== "string" || payload.sub === "") return null;
    if (!payload.iat || !payload.exp) return null;

    return { sub: payload.sub, iat: payload.iat, exp: payload.exp };
  } catch {
    return null;
  }
}

export async function createSession(userId: string): Promise<void> {
  const token = await signSessionToken(userId);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // local development serves plain HTTP, where a `secure` cookie is never sent back.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

// DO NOT GUARD A MUTATION OR A READ WITH THIS: it only proves the cookie is
// signed, the account may be gone, and it returns no owner to filter queries on.
// Guard with `requireUser()`; this one only decides a redirect without the db.
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
