// Password hashing. NEVER import this module from `lib/auth.ts`: `proxy.ts`
// imports that one on every request and runs in the Edge runtime, where
// `node:crypto` does not exist, and the whole app fails rather than just sign-in.

import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// scrypt cost, OWASP 2024: N >= 2^17, r = 8, p = 1, about 130 ms per hash.
// `maxmem` must be set explicitly: scrypt needs about `128 * N * r`, i.e. 128 MiB
// here, and Node's 32 MiB default makes it throw `memory limit exceeded` at signup.

const N = 131_072; // 2^17
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALT_BYTES = 16;
const MAXMEM = 256 * 1024 * 1024;

// length is the only shape rule: NIST SP 800-63B (5.1.1.2) advises against
// requiring uppercase, digits or symbols.
export const PASSWORD_MIN = 12;

// scrypt hashes the whole input, so an uncapped submission is a denial of
// service in one `curl`.
export const PASSWORD_MAX = 512;

// every entry is 12 characters or more; anything shorter is already refused by
// the length check above.
const TOO_COMMON = new Set([
  "motdepasse123",
  "password1234",
  "passsword123",
  "123456789012",
  "azertyuiop12",
  "qwertyuiop12",
  "administrateur",
  "administrator",
  "towncenter123",
  "changeme1234",
]);

export type PasswordRefusal =
  | { key: "short"; message: string }
  | { key: "long"; message: string }
  | { key: "known"; message: string }
  | { key: "email"; message: string };

// `null` when the password is acceptable. The email is passed in so it cannot be
// reused as the password.
export function checkPasswordShape(
  password: string,
  email: string,
): PasswordRefusal | null {
  if (password.length < PASSWORD_MIN) {
    return {
      key: "short",
      message: `Au moins ${PASSWORD_MIN} caractères : c’est la longueur qui protège, pas les symboles.`,
    };
  }

  if (password.length > PASSWORD_MAX) {
    return {
      key: "long",
      message: `${PASSWORD_MAX} caractères au maximum.`,
    };
  }

  if (TOO_COMMON.has(password.toLowerCase())) {
    return {
      key: "known",
      message: "Ce mot de passe figure dans les listes de mots de passe divulgués. Choisissez-en un autre.",
    };
  }

  const local = email.split("@")[0]?.trim().toLowerCase() ?? "";
  if (local.length >= 4 && password.toLowerCase().includes(local)) {
    return {
      key: "email",
      message: "Il contient votre adresse e-mail. Toute tentative de devinette commencerait par là.",
    };
  }

  return null;
}

// the format carries its own parameters (`scrypt$N$r$p$salt$digest`) so raising N
// later leaves stored hashes verifiable instead of invalidating every password.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });

  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

// Never throws. The EMPTY hash is refused before any comparison: it belongs to
// the unclaimed sentinel account, and one reordered check would turn it into "no
// password required". The comparison is constant time; `===` leaks byte counts.
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (stored === "" || password === "") return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  // an absurd `N` read from a forged hash would allocate gigabytes.
  if (n < 16_384 || n > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 16) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "base64");
    expected = Buffer.from(parts[5]!, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const candidate = await scryptAsync(
      password.normalize("NFKC"),
      salt,
      expected.length,
      { N: n, r, p, maxmem: MAXMEM },
    );
    // `timingSafeEqual` throws on differing lengths, hence the key length coming
    // from `expected.length` rather than `KEYLEN`.
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}
