// GitHubClient — an authenticated session against the GitHub REST API for
// one App installation. All per-Consumer-Repo operations hang off this
// interface; callers don't thread the install token by hand.
//
// Constructed via createGitHubClient(...) which handles JWT signing and the
// installation-token exchange. The factory returns the concrete
// HttpGitHubClient. Tests can supply a fake by satisfying the GitHubClient
// interface directly — structural typing means no inheritance needed.

import { signAppJwt, getInstallationToken } from "./app-auth.js";
import { encryptSecretValue } from "../crypto/sealed-box.js";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "agent-workflows-installer";
const GITHUB_API_VERSION = "2022-11-28";

export interface RepoSummary {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  owner: { login: string };
}

export interface PrResult {
  url: string;
  number: number;
}

export interface OpenSingleFilePrOptions {
  owner: string;
  repo: string;
  defaultBranch: string;
  filePath: string;
  fileContent: string;
  prTitle: string;
  prBody: string;
  // Commit message used when the file does not yet exist on the branch.
  commitMessageNew: string;
  // Commit message used when overwriting an existing file (PUT contents
  // requires a sha when the file is already present).
  commitMessageUpdate: string;
  // Defaults to `agent-workflows/install-${Date.now()}`. Override only for
  // deterministic tests or explicit branch naming.
  branchName?: string;
}

export interface GitHubClient {
  listInstallationRepos(): Promise<RepoSummary[]>;
  ensureLabel(owner: string, repo: string, name: string): Promise<void>;
  putRepoSecret(
    owner: string,
    repo: string,
    name: string,
    value: string,
  ): Promise<{ created: boolean }>;
  openSingleFilePr(opts: OpenSingleFilePrOptions): Promise<PrResult>;
}

export interface CreateGitHubClientOptions {
  appId: string;
  privateKeyPem: string;
  installationId: number;
}

// Default factory — real auth flow. Used by app.ts at request time.
export async function createGitHubClient(
  opts: CreateGitHubClientOptions,
): Promise<GitHubClient> {
  const jwt = await signAppJwt(opts.appId, opts.privateKeyPem);
  const { token } = await getInstallationToken(jwt, opts.installationId);
  return new HttpGitHubClient(token);
}

export class HttpGitHubClient implements GitHubClient {
  constructor(private readonly token: string) {}

  async listInstallationRepos(): Promise<RepoSummary[]> {
    const repos: RepoSummary[] = [];
    let page = 1;
    for (;;) {
      const json = await this.getJson<{
        total_count: number;
        repositories: RepoSummary[];
      }>(
        `/installation/repositories?per_page=100&page=${page}`,
        "list installation repos",
      );
      repos.push(...json.repositories);
      if (repos.length >= json.total_count || json.repositories.length === 0) break;
      page++;
    }
    return repos;
  }

  async ensureLabel(owner: string, repo: string, name: string): Promise<void> {
    const res = await this.fetch(`/repos/${owner}/${repo}/labels`, {
      method: "POST",
      body: JSON.stringify({
        name,
        color: "ededed",
        description: "Bot-filed bug scan",
      }),
    });
    if (res.ok || res.status === 422 /* already exists */) return;
    throw await errorFor(res, "ensure label");
  }

  async putRepoSecret(
    owner: string,
    repo: string,
    name: string,
    value: string,
  ): Promise<{ created: boolean }> {
    const pk = await this.getJson<{ key_id: string; key: string }>(
      `/repos/${owner}/${repo}/actions/secrets/public-key`,
      "get public-key",
    );
    const encrypted = encryptSecretValue(pk.key, value);

    const res = await this.fetch(
      `/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(name)}`,
      {
        method: "PUT",
        body: JSON.stringify({ encrypted_value: encrypted, key_id: pk.key_id }),
      },
    );
    if (res.status === 201) return { created: true };
    if (res.status === 204) return { created: false };
    throw await errorFor(res, "put secret");
  }

  async openSingleFilePr(opts: OpenSingleFilePrOptions): Promise<PrResult> {
    const branch =
      opts.branchName ?? `agent-workflows/install-${Date.now()}`;

    // 1) Create the branch from the default branch's tip.
    const ref = await this.getJson<{ object: { sha: string } }>(
      `/repos/${opts.owner}/${opts.repo}/git/ref/heads/${opts.defaultBranch}`,
      "get default ref",
    );

    const createRefRes = await this.fetch(
      `/repos/${opts.owner}/${opts.repo}/git/refs`,
      {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }),
      },
    );
    if (!createRefRes.ok && createRefRes.status !== 422 /* already exists */) {
      throw await errorFor(createRefRes, "create ref");
    }

    // 2) Commit the file (with sha if it already exists on the branch).
    const existingSha = await this.getFileSha(
      opts.owner,
      opts.repo,
      opts.filePath,
      branch,
    );
    const contentB64 = btoa(unescape(encodeURIComponent(opts.fileContent)));
    const message = existingSha ? opts.commitMessageUpdate : opts.commitMessageNew;
    const putRes = await this.fetch(
      `/repos/${opts.owner}/${opts.repo}/contents/${opts.filePath}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message,
          content: contentB64,
          branch,
          ...(existingSha ? { sha: existingSha } : {}),
        }),
      },
    );
    if (!putRes.ok) throw await errorFor(putRes, "put contents");

    // 3) Open the PR.
    const pr = await this.postJson<{ number: number; html_url: string }>(
      `/repos/${opts.owner}/${opts.repo}/pulls`,
      {
        title: opts.prTitle,
        head: branch,
        base: opts.defaultBranch,
        body: opts.prBody,
      },
      "open PR",
    );
    return { url: pr.html_url, number: pr.number };
  }

  // Internals

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": USER_AGENT,
    };
    if (init?.body) headers["Content-Type"] = "application/json";
    return fetch(`${GITHUB_API}${path}`, { ...init, headers });
  }

  private async getJson<T>(path: string, label: string): Promise<T> {
    const res = await this.fetch(path);
    if (!res.ok) throw await errorFor(res, label);
    return (await res.json()) as T;
  }

  private async postJson<T>(path: string, body: unknown, label: string): Promise<T> {
    const res = await this.fetch(path, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) throw await errorFor(res, label);
    return (await res.json()) as T;
  }

  private async getFileSha(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string | undefined> {
    const res = await this.fetch(
      `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    );
    if (res.status === 404) return undefined;
    if (!res.ok) throw await errorFor(res, "get file sha");
    const json = (await res.json()) as { sha: string };
    return json.sha;
  }
}

async function errorFor(res: Response, label: string): Promise<Error> {
  return new Error(`${label} failed: ${res.status} ${await res.text()}`);
}
