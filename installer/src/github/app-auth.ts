// GitHub App authentication on Vercel Edge runtime — no Octokit, just fetch + WebCrypto.
//
// Two-step auth:
//   1) Sign a short-lived (10-min) JWT with the App's RSA private key (RS256)
//   2) Exchange the JWT for an installation access token (1-hour lifetime)
//
// The install token is what every subsequent REST call uses as Bearer auth.

const JWT_LIFETIME_SECONDS = 9 * 60; // 9 minutes — GitHub allows up to 10
const GITHUB_API = "https://api.github.com";

interface ImportedKey {
  pem: string;
  key: CryptoKey;
}

let cachedKey: ImportedKey | undefined;

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  if (cachedKey && cachedKey.pem === pem) return cachedKey.key;

  let pkcs8: ArrayBuffer;
  try {
    pkcs8 = pemToArrayBuffer(pem);
  } catch (e) {
    throw new Error(
      `GITHUB_APP_PRIVATE_KEY did not decode as PEM. Make sure the env var holds the full PEM including BEGIN/END lines, with real newlines (not literal \\n). Underlying: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    cachedKey = { pem, key };
    return key;
  } catch (e) {
    throw new Error(
      `GITHUB_APP_PRIVATE_KEY isn't a valid RSA PKCS8 key. The PEM decoded but WebCrypto rejected it. Underlying: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Normalize literal "\n" sequences (sometimes pasted via env-var GUIs) to
  // actual newlines before stripping whitespace, otherwise the backslash + n
  // ends up inside the base64 body and atob throws "Invalid keyData".
  const normalized = pem.replace(/\\r\\n|\\n/g, "\n");

  // GitHub Apps generate private keys in PKCS#1 format ("BEGIN RSA PRIVATE
  // KEY"), but WebCrypto's importKey("pkcs8", …) requires PKCS#8 format
  // ("BEGIN PRIVATE KEY"). Detect by the header and, when PKCS#1, wrap the
  // raw RSA key in the PKCS#8 envelope (algorithm = rsaEncryption).
  const isPkcs1 = /-----BEGIN RSA PRIVATE KEY-----/.test(normalized);

  const b64 = normalized
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pkcs8 = isPkcs1 ? wrapPkcs1AsPkcs8(bytes) : bytes;
  const buf = new ArrayBuffer(pkcs8.length);
  new Uint8Array(buf).set(pkcs8);
  return buf;
}

// Wrap a raw PKCS#1 RSA private key in a PKCS#8 PrivateKeyInfo envelope so
// WebCrypto can import it. The envelope is:
//   SEQUENCE {
//     INTEGER 0                       (version)
//     SEQUENCE {                      (privateKeyAlgorithm)
//       OID 1.2.840.113549.1.1.1      (rsaEncryption)
//       NULL                          (parameters)
//     }
//     OCTET STRING { <pkcs1 bytes> }  (privateKey)
//   }
function wrapPkcs1AsPkcs8(pkcs1: Uint8Array): Uint8Array {
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

  const out = new Uint8Array(outerHeader.length + innerLength);
  let i = 0;
  out.set(outerHeader, i); i += outerHeader.length;
  out.set(version, i); i += version.length;
  out.set(algIdentifier, i); i += algIdentifier.length;
  out.set(octetStringHeader, i); i += octetStringHeader.length;
  out.set(pkcs1, i);
  return out;
}

// DER length encoding: short form for <128, long form (0x80 + N length bytes,
// big-endian) for larger. Most RSA keys land in the 1100–1200 byte range, so
// length-of-length 2 covers them.
function derTagAndLength(tag: number, length: number): Uint8Array {
  if (length < 0x80) return Uint8Array.of(tag, length);
  if (length <= 0xff) return Uint8Array.of(tag, 0x81, length);
  if (length <= 0xffff) return Uint8Array.of(tag, 0x82, (length >> 8) & 0xff, length & 0xff);
  if (length <= 0xffffff) return Uint8Array.of(tag, 0x83, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff);
  return Uint8Array.of(tag, 0x84, (length >>> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeJson(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return base64UrlEncode(bytes);
}

export async function signAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat: now - 30, exp: now + JWT_LIFETIME_SECONDS, iss: appId };

  const data = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(data),
  );
  return `${data}.${base64UrlEncode(new Uint8Array(sig))}`;
}

export interface InstallationToken {
  token: string;
  expiresAt: string;
}

export async function getInstallationToken(
  appJwt: string,
  installationId: number,
): Promise<InstallationToken> {
  const res = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "agent-workflows-installer",
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`installation-token exchange failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { token: string; expires_at: string };
  return { token: json.token, expiresAt: json.expires_at };
}

// Convenience: list the repos the install can access. Used by the setup form to
// show "this install covers N repos — install on all of them?"
export interface InstallationRepo {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  owner: { login: string };
}

export async function listInstallationRepos(
  installToken: string,
): Promise<InstallationRepo[]> {
  const repos: InstallationRepo[] = [];
  let page = 1;
  for (;;) {
    const res = await fetch(
      `${GITHUB_API}/installation/repositories?per_page=100&page=${page}`,
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
      throw new Error(`list installation repos failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      total_count: number;
      repositories: InstallationRepo[];
    };
    repos.push(...json.repositories);
    if (repos.length >= json.total_count || json.repositories.length === 0) break;
    page++;
  }
  return repos;
}
