/** HMAC-signed cookie values: `${value}.${base64url(hmacSha256(value))}`. */

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signValue(value: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return `${value}.${base64UrlEncode(mac)}`;
}

/** Returns the embedded value if the signature checks out, else null. */
export async function verifyValue(
  signed: string | undefined | null,
  secret: string,
): Promise<string | null> {
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = signed.slice(0, dot);
  const mac = signed.slice(dot + 1);
  const key = await hmacKey(secret);
  let macBytes: Uint8Array;
  try {
    macBytes = base64UrlDecode(mac);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    macBytes as unknown as ArrayBuffer,
    encoder.encode(value),
  );
  return ok ? value : null;
}
