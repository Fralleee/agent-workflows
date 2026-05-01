// libsodium's `crypto_box_seal`, implemented with tweetnacl + @noble/hashes.
// We avoid `libsodium-wrappers` because its ESM build references a
// non-existent `./libsodium.mjs` file, which breaks edge bundlers.
// Algorithm reference:
// https://doc.libsodium.org/public-key_cryptography/sealed_boxes
//
// Used to encrypt repository Actions secrets (the recipient is the repo's
// libsodium public key, fetched from the GitHub API).

import nacl from "tweetnacl";
import { blake2b } from "@noble/hashes/blake2b";

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

// Helper for encrypting a string against a base64-encoded recipient public key.
export function encryptSecretValue(publicKeyB64: string, value: string): string {
  const recipient = base64Decode(publicKeyB64);
  const message = new TextEncoder().encode(value);
  const sealed = cryptoBoxSeal(message, recipient);
  return base64Encode(sealed);
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
