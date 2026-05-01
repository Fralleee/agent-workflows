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

  const pkcs8 = pemToArrayBuffer(pem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  cachedKey = { pem, key };
  return key;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
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
