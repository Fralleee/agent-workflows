// GitHub App authentication primitives. Internal to the github/ package — the
// rest of the codebase only sees GitHubClient (in client.ts), constructed via
// createGitHubClient(...). These two functions are the auth side of that flow.
//
//   1) signAppJwt — short-lived (10-min) JWT signed with the App's RSA key.
//   2) getInstallationToken — exchange the JWT for a 1-hour installation token.

import { importRsaPrivateKey } from "../crypto/pem-rsa.js";

const JWT_LIFETIME_SECONDS = 9 * 60; // 9 minutes — GitHub allows up to 10
const GITHUB_API = "https://api.github.com";

interface ImportedKey {
  pem: string;
  key: CryptoKey;
}

let cachedKey: ImportedKey | undefined;

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  if (cachedKey && cachedKey.pem === pem) return cachedKey.key;

  let key: CryptoKey;
  try {
    key = await importRsaPrivateKey(pem);
  } catch (e) {
    const underlying = e instanceof Error ? e.message : String(e);
    throw new Error(
      `GITHUB_APP_PRIVATE_KEY isn't a valid RSA private key. Make sure the env var holds the full PEM including BEGIN/END lines, with real newlines (not literal \\n). Underlying: ${underlying}`,
    );
  }
  cachedKey = { pem, key };
  return key;
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
