import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimale HS256-JWTs fuer die angemeldeten Browsertests.
 *
 * Ein echtes Supabase-Projekt signiert die Zugangsmerkmale in GoTrue; die
 * Testbruecke (`bridge.ts`) prueft dieselbe Signatur und reicht die Claims als
 * `request.jwt.claims` an PostgreSQL weiter — genau wie PostgREST es tut. Damit
 * greifen im Browsertest die **echten** RLS-Policies (`auth.uid()`), statt sie
 * zu umgehen.
 *
 * Das Geheimnis ist ein Testwert und steht bewusst im Repository: Es schuetzt
 * nichts ausser einer lokalen Wegwerf-Datenbank.
 */
export const JWT_SECRET = "e2e-test-jwt-secret-nicht-fuer-produktion";

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: "authenticated";
  exp: number;
  iat: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(data: string): string {
  return base64url(createHmac("sha256", JWT_SECRET).update(data).digest());
}

/** Erzeugt ein signiertes Zugangsmerkmal fuer einen Testnutzer. */
export function mintAccessToken(
  userId: string,
  email: string,
  lifetimeSeconds = 60 * 60,
): { token: string; expiresAt: number } {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + lifetimeSeconds;
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: userId,
      email,
      role: "authenticated",
      aud: "authenticated",
      iat: issuedAt,
      exp: expiresAt,
    } satisfies AccessTokenClaims & { aud: string }),
  );
  const data = `${header}.${payload}`;
  return { token: `${data}.${sign(data)}`, expiresAt };
}

/**
 * Prueft Signatur und Laufzeit. Liefert `null`, wenn das Merkmal ungueltig ist
 * — dann behandelt die Bruecke die Anfrage als nicht angemeldet (Rolle `anon`),
 * wie ein echtes Supabase-Projekt es taete.
 */
export function verifyAccessToken(token: string): AccessTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];

  const expected = Buffer.from(sign(`${header}.${payload}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as AccessTokenClaims;
    if (typeof claims.sub !== "string" || typeof claims.exp !== "number") return null;
    if (claims.exp * 1000 <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
