// Decode an RSA private key from PEM into a WebCrypto CryptoKey for RS256
// signing. Handles three real-world quirks that bit us during the App rollout:
//
//   1) Literal "\n" in env-var-passed PEMs (Vercel dashboard, several CI tools)
//      get normalized to actual newlines before base64 decode — otherwise the
//      backslash + n ends up inside the base64 body and atob throws.
//
//   2) PKCS#1 keys (header: "BEGIN RSA PRIVATE KEY") are wrapped in the PKCS#8
//      PrivateKeyInfo envelope so WebCrypto's importKey("pkcs8", …) accepts
//      them. GitHub Apps generate keys in PKCS#1; WebCrypto only takes PKCS#8.
//
//   3) PKCS#8 keys (header: "BEGIN PRIVATE KEY") pass through unchanged.

export async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const pkcs8 = pemToPkcs8Bytes(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// Internals

function pemToPkcs8Bytes(pem: string): Uint8Array<ArrayBuffer> {
  const normalized = pem.replace(/\\r\\n|\\n/g, "\n");
  const isPkcs1 = /-----BEGIN RSA PRIVATE KEY-----/.test(normalized);

  const b64 = normalized
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return isPkcs1 ? wrapPkcs1AsPkcs8(bytes) : bytes;
}

// Wrap a raw PKCS#1 RSA private key in the PKCS#8 PrivateKeyInfo envelope:
//   SEQUENCE {
//     INTEGER 0                       (version)
//     SEQUENCE {                      (privateKeyAlgorithm)
//       OID 1.2.840.113549.1.1.1      (rsaEncryption)
//       NULL                          (parameters)
//     }
//     OCTET STRING { <pkcs1 bytes> }  (privateKey)
//   }
function wrapPkcs1AsPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const algIdentifier = Uint8Array.of(
    0x30, 0x0d,             // SEQUENCE, len 13
    0x06, 0x09,             // OID, len 9
    0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,             // NULL
  );
  const octetStringHeader = derTagAndLength(0x04, pkcs1.length);
  const innerLength =
    version.length + algIdentifier.length + octetStringHeader.length + pkcs1.length;
  const outerHeader = derTagAndLength(0x30, innerLength);

  const outBuf = new ArrayBuffer(outerHeader.length + innerLength);
  const out = new Uint8Array(outBuf);
  let i = 0;
  out.set(outerHeader, i); i += outerHeader.length;
  out.set(version, i); i += version.length;
  out.set(algIdentifier, i); i += algIdentifier.length;
  out.set(octetStringHeader, i); i += octetStringHeader.length;
  out.set(pkcs1, i);
  return out;
}

// DER length encoding: short form for <128, long form (0x80 + N length bytes,
// big-endian) for larger. Most RSA-2048 PKCS#1 bodies land in the 1100–1200
// byte range, so length-of-length 2 covers them — but keep the full ladder
// in case someone passes a much larger key.
function derTagAndLength(tag: number, length: number): Uint8Array {
  if (length < 0x80) return Uint8Array.of(tag, length);
  if (length <= 0xff) return Uint8Array.of(tag, 0x81, length);
  if (length <= 0xffff) return Uint8Array.of(tag, 0x82, (length >> 8) & 0xff, length & 0xff);
  if (length <= 0xffffff) return Uint8Array.of(tag, 0x83, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff);
  return Uint8Array.of(tag, 0x84, (length >>> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff);
}
