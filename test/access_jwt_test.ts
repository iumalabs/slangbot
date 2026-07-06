/** Access JWT verification: valid, expired, wrong aud, spoofed signature. */
import { assert, assertEquals } from "@std/assert";
import { type AccessJwk, verifyAccessJwt } from "../src/lib/access-jwt.ts";
import { base64UrlEncode } from "../src/lib/cookies.ts";

const encoder = new TextEncoder();

async function makeKeyPair() {
  return await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

async function makeJwt(
  key: CryptoKeyPair,
  claims: Record<string, unknown>,
  kid = "kid-1",
): Promise<string> {
  const header = base64UrlEncode(
    encoder.encode(JSON.stringify({ alg: "RS256", kid })),
  );
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key.privateKey,
    encoder.encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64UrlEncode(sig)}`;
}

async function exportJwk(
  key: CryptoKeyPair,
  kid = "kid-1",
): Promise<AccessJwk> {
  const jwk = await crypto.subtle.exportKey("jwk", key.publicKey);
  return { kid, kty: jwk.kty!, n: jwk.n!, e: jwk.e! };
}

const NOW = 1_800_000_000;

Deno.test("valid Access JWT is accepted", async () => {
  const pair = await makeKeyPair();
  const token = await makeJwt(pair, {
    aud: ["my-aud"],
    exp: NOW + 600,
    email: "a@b.c",
  });
  const claims = await verifyAccessJwt(token, {
    aud: "my-aud",
    getKeys: async () => [await exportJwk(pair)],
    nowSeconds: NOW,
  });
  assert(claims !== null);
  assertEquals(claims.email, "a@b.c");
});

Deno.test("expired JWT is rejected", async () => {
  const pair = await makeKeyPair();
  const token = await makeJwt(pair, { aud: ["my-aud"], exp: NOW - 10 });
  const claims = await verifyAccessJwt(token, {
    aud: "my-aud",
    getKeys: async () => [await exportJwk(pair)],
    nowSeconds: NOW,
  });
  assertEquals(claims, null);
});

Deno.test("wrong aud is rejected", async () => {
  const pair = await makeKeyPair();
  const token = await makeJwt(pair, { aud: ["other-aud"], exp: NOW + 600 });
  const claims = await verifyAccessJwt(token, {
    aud: "my-aud",
    getKeys: async () => [await exportJwk(pair)],
    nowSeconds: NOW,
  });
  assertEquals(claims, null);
});

Deno.test("spoofed token signed by an untrusted key is rejected", async () => {
  const trusted = await makeKeyPair();
  const attacker = await makeKeyPair();
  const token = await makeJwt(attacker, { aud: ["my-aud"], exp: NOW + 600 });
  const claims = await verifyAccessJwt(token, {
    aud: "my-aud",
    getKeys: async () => [await exportJwk(trusted)],
    nowSeconds: NOW,
  });
  assertEquals(claims, null);
});

Deno.test("garbage and missing tokens are rejected", async () => {
  const getKeys = () => Promise.resolve([]);
  assertEquals(await verifyAccessJwt(undefined, { aud: "a", getKeys }), null);
  assertEquals(await verifyAccessJwt("", { aud: "a", getKeys }), null);
  assertEquals(await verifyAccessJwt("a.b", { aud: "a", getKeys }), null);
  assertEquals(await verifyAccessJwt("not.a.jwt", { aud: "a", getKeys }), null);
});
