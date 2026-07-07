/**
 * Cloudflare Access JWT verification (RS256).
 *
 * Every /admin request must carry a valid `Cf-Access-Jwt-Assertion` header.
 * We verify the signature against the team's public certs and check the
 * `aud` and `exp` claims — header presence alone is never trusted.
 */

import { base64UrlDecode } from "./cookies.ts";

export interface AccessJwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
}

export type KeyFetcher = () => Promise<AccessJwk[]>;

export interface VerifyOptions {
  aud: string;
  getKeys: KeyFetcher;
  /** Override "now" (seconds since epoch) — used by tests. */
  nowSeconds?: number;
}

export interface AccessClaims {
  aud: string | string[];
  exp: number;
  iat?: number;
  email?: string;
  iss?: string;
  [k: string]: unknown;
}

function decodeSegment<T>(seg: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(seg))) as T;
}

/** Returns the verified claims, or null if the token is invalid. */
export async function verifyAccessJwt(
  token: string | null | undefined,
  opts: VerifyOptions,
): Promise<AccessClaims | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header: { alg?: string; kid?: string };
  let claims: AccessClaims;
  try {
    header = decodeSegment(parts[0]);
    claims = decodeSegment(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null;

  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now) return null;

  const audList = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!opts.aud || !audList.includes(opts.aud)) return null;

  let keys: AccessJwk[];
  try {
    keys = await opts.getKeys();
  } catch {
    return null;
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sig = base64UrlDecode(parts[2]);
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      sig as unknown as ArrayBuffer,
      data,
    );
    return ok ? claims : null;
  } catch {
    return null;
  }
}

/**
 * Accepts either the bare team name ("myteam") or the full team domain
 * ("myteam.cloudflareaccess.com").
 */
export function normalizeTeamDomain(teamDomain: string): string {
  const t = teamDomain.trim();
  return t.includes(".") ? t : `${t}.cloudflareaccess.com`;
}

/** Fetch the team's public certs, cached in KV for an hour. */
export function kvCachedKeyFetcher(
  kv: KVNamespace,
  teamDomain: string,
): KeyFetcher {
  return async () => {
    const cacheKey = "access:certs";
    const cached = await kv.get(cacheKey);
    if (cached) return (JSON.parse(cached) as { keys: AccessJwk[] }).keys;
    const res = await fetch(
      `https://${normalizeTeamDomain(teamDomain)}/cdn-cgi/access/certs`,
    );
    if (!res.ok) throw new Error(`certs fetch failed: ${res.status}`);
    const body = await res.text();
    await kv.put(cacheKey, body, { expirationTtl: 3600 });
    return (JSON.parse(body) as { keys: AccessJwk[] }).keys;
  };
}
