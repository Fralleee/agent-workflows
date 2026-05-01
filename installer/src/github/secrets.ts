// Sets a repository Actions secret using GitHub's two-step flow:
//   1) GET the repo's libsodium public key
//   2) Encrypt the secret value with sealed_box and PUT with the matching key_id
//
// libsodium's `crypto_box_seal` is implemented manually here using tweetnacl
// (X25519 + XSalsa20Poly1305) and @noble/hashes/blake2b for the nonce
// derivation. We avoid `libsodium-wrappers` because its ESM build references
// a non-existent `./libsodium.mjs` file, which breaks edge bundlers. Algorithm
// reference: https://doc.libsodium.org/public-key_cryptography/sealed_boxes
//
// The secret value is in memory for one HTTP request and never persisted.

import nacl from "tweetnacl";
import { blake2b } from "@noble/hashes/blake2b";

const GITHUB_API = "https://api.github.com";

interface PublicKey {
  key_id: string;
  key: string; // base64
}

async function getRepoPublicKey(
  installToken: string,
  owner: string,
  repo: string,
): Promise<PublicKey> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/secrets/public-key`,
    {
      headers: {
        Authorization: `Bearer ${installToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "agent-workflows-installer",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`get public-key failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as PublicKey;
}

// crypto_box_seal: sender is anonymous, only recipient's public key is needed.
//
//   ephemeral_kp = X25519 keypair
//   nonce = blake2b(ephemeral_pk || recipient_pk, dkLen=24)
//   ciphertext = crypto_box(message, nonce, recipient_pk, ephemeral_priv)
//   output = ephemeral_pk || ciphertext
export function cryptoBoxSeal(
  message: Uint8Array,
  recipientPublicKey: Uint8Array,
): Uint8Array {
  if (recipientPublicKey.length !== nacl.box.publicKeyLength) {
    throw new Error(
      `recipient public key must be ${nacl.box.publicKeyLength} bytes, got ${recipientPublicKey.length}`,
    );
  }
  const ephemeral = nacl.box.keyPair();

  const nonceInput = new Uint8Array(
    nacl.box.publicKeyLength + recipientPublicKey.length,
  );
  nonceInput.set(ephemeral.publicKey, 0);
  nonceInput.set(recipientPublicKey, nacl.box.publicKeyLength);
  const nonce = blake2b(nonceInput, { dkLen: nacl.box.nonceLength });

  const ciphertext = nacl.box(
    message,
    nonce,
    recipientPublicKey,
    ephemeral.secretKey,
  );

  const out = new Uint8Array(ephemeral.publicKey.length + ciphertext.length);
  out.set(ephemeral.publicKey, 0);
  out.set(ciphertext, ephemeral.publicKey.length);
  return out;
}

// Inverse of cryptoBoxSeal — used in tests to verify round-trips.
export function cryptoBoxSealOpen(
  sealed: Uint8Array,
  recipientPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array,
): Uint8Array | null {
  if (sealed.length < nacl.box.publicKeyLength) return null;
  const ephemeralPubKey = sealed.slice(0, nacl.box.publicKeyLength);
  const ciphertext = sealed.slice(nacl.box.publicKeyLength);

  const nonceInput = new Uint8Array(
    nacl.box.publicKeyLength + recipientPublicKey.length,
  );
  nonceInput.set(ephemeralPubKey, 0);
  nonceInput.set(recipientPublicKey, nacl.box.publicKeyLength);
  const nonce = blake2b(nonceInput, { dkLen: nacl.box.nonceLength });

  return nacl.box.open(
    ciphertext,
    nonce,
    ephemeralPubKey,
    recipientPrivateKey,
  );
}

export async function encryptSecretValue(
  publicKeyB64: string,
  value: string,
): Promise<string> {
  const recipient = base64Decode(publicKeyB64);
  const message = new TextEncoder().encode(value);
  const sealed = cryptoBoxSeal(message, recipient);
  return base64Encode(sealed);
}

export async function putRepoSecret(
  installToken: string,
  owner: string,
  repo: string,
  secretName: string,
  secretValue: string,
): Promise<{ created: boolean }> {
  const pk = await getRepoPublicKey(installToken, owner, repo);
  const encrypted = await encryptSecretValue(pk.key, secretValue);

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(secretName)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${installToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "agent-workflows-installer",
      },
      body: JSON.stringify({ encrypted_value: encrypted, key_id: pk.key_id }),
    },
  );

  if (res.status === 201) return { created: true };
  if (res.status === 204) return { created: false };
  throw new Error(`put secret failed: ${res.status} ${await res.text()}`);
}

function base64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64Encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
