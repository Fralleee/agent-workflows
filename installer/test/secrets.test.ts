import { describe, expect, it } from "bun:test";
import nacl from "tweetnacl";
import {
  cryptoBoxSeal,
  cryptoBoxSealOpen,
  encryptSecretValue,
} from "../src/github/secrets.js";

describe("crypto_box_seal", () => {
  it("seals a message that the matching keypair can open", () => {
    const kp = nacl.box.keyPair();
    const msg = new TextEncoder().encode("hello sealed_box");
    const sealed = cryptoBoxSeal(msg, kp.publicKey);
    const opened = cryptoBoxSealOpen(sealed, kp.publicKey, kp.secretKey);
    expect(opened).not.toBeNull();
    expect(new TextDecoder().decode(opened!)).toBe("hello sealed_box");
  });

  it("a wrong keypair cannot decrypt", () => {
    const realKp = nacl.box.keyPair();
    const wrongKp = nacl.box.keyPair();
    const msg = new TextEncoder().encode("secret");
    const sealed = cryptoBoxSeal(msg, realKp.publicKey);
    const opened = cryptoBoxSealOpen(
      sealed,
      wrongKp.publicKey,
      wrongKp.secretKey,
    );
    expect(opened).toBeNull();
  });

  it("rejects malformed recipient keys", () => {
    expect(() => cryptoBoxSeal(new Uint8Array([1, 2, 3]), new Uint8Array(8))).toThrow(
      /must be 32 bytes/,
    );
  });

  it("each call uses a fresh ephemeral key (ciphertext varies)", () => {
    const kp = nacl.box.keyPair();
    const msg = new TextEncoder().encode("same input");
    const a = cryptoBoxSeal(msg, kp.publicKey);
    const b = cryptoBoxSeal(msg, kp.publicKey);
    // First 32 bytes is the ephemeral pubkey; should differ across calls.
    expect(a.slice(0, 32)).not.toEqual(b.slice(0, 32));
    // But both should decrypt to the same plaintext.
    const oa = cryptoBoxSealOpen(a, kp.publicKey, kp.secretKey);
    const ob = cryptoBoxSealOpen(b, kp.publicKey, kp.secretKey);
    expect(new TextDecoder().decode(oa!)).toBe("same input");
    expect(new TextDecoder().decode(ob!)).toBe("same input");
  });
});

describe("encryptSecretValue", () => {
  it("returns base64 the matching keypair can decrypt", async () => {
    const kp = nacl.box.keyPair();
    const pubB64 = btoa(String.fromCharCode(...kp.publicKey));

    const plaintext = "sk-test-fake-key-1234567890abcdef";
    const ciphertextB64 = await encryptSecretValue(pubB64, plaintext);

    expect(ciphertextB64).toMatch(/^[A-Za-z0-9+/]+=*$/);

    const sealed = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
    const opened = cryptoBoxSealOpen(sealed, kp.publicKey, kp.secretKey);
    expect(new TextDecoder().decode(opened!)).toBe(plaintext);
  });
});
