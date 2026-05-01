// POST /install — orchestrator. For each repo the installation covers:
//   1) ensure label
//   2) PUT actions secret (API key, encrypted with sealed_box)
//   3) open PR adding .github/workflows/daily-scan.yml
// Per-repo failures are isolated. Returns RepoResult[]; renderInstallResults
// turns those into the success page.

import { resolveProfile, type Provider } from "../profiles.js";
import { renderStub } from "../stub.js";
import {
  signAppJwt,
  getInstallationToken,
  listInstallationRepos,
} from "../github/app-auth.js";
import { putRepoSecret } from "../github/secrets.js";
import { ensureLabel } from "../github/label.js";
import { openInstallPr } from "../github/pr.js";

export interface InstallEnv {
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  HUB_REPO: string;
  HUB_REF: string;
  LABEL: string;
}

export interface InstallFormData {
  installationId: number;
  profileId: string;
  customProvider?: Provider;
  customModel?: string;
  apiKey: string;
  enableAutoPr: boolean;
}

export interface RepoResult {
  repo: string;
  prUrl?: string;
  error?: string;
}

export async function runInstall(
  form: InstallFormData,
  env: InstallEnv,
): Promise<RepoResult[]> {
  const { provider, model, secretName } = resolveProfile(
    form.profileId,
    form.customProvider && form.customModel
      ? { provider: form.customProvider, model: form.customModel }
      : undefined,
  );

  const jwt = await signAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  const { token } = await getInstallationToken(jwt, form.installationId);
  const repos = await listInstallationRepos(token);

  const stub = renderStub({
    hubRepo: env.HUB_REPO,
    hubRef: env.HUB_REF,
    provider,
    model,
    secretName,
    enableAutoPr: form.enableAutoPr,
  });

  // Run the per-repo work concurrently but cap parallelism at 4 to avoid
  // tripping GitHub's secondary rate limits.
  const results: RepoResult[] = [];
  await runWithConcurrency(repos, 4, async (repo) => {
    const owner = repo.owner.login;
    try {
      await ensureLabel(token, owner, repo.name, env.LABEL);
      await putRepoSecret(token, owner, repo.name, secretName, form.apiKey);
      const pr = await openInstallPr({
        installToken: token,
        owner,
        repo: repo.name,
        defaultBranch: repo.default_branch,
        fileContent: stub,
      });
      results.push({ repo: repo.full_name, prUrl: pr.url });
    } catch (e) {
      results.push({ repo: repo.full_name, error: errorMessage(e) });
    }
  });
  return results;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = items.slice();
  const runners: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, queue.length); i++) {
    runners.push(
      (async () => {
        for (;;) {
          const next = queue.shift();
          if (!next) return;
          await worker(next);
        }
      })(),
    );
  }
  await Promise.all(runners);
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function renderInstallResults(results: RepoResult[]): Response {
  const ok = results.filter((r) => r.prUrl);
  const failed = results.filter((r) => r.error);

  const okList = ok
    .map(
      (r) =>
        `<li><strong>${escapeHtml(r.repo)}</strong> — <a href="${escapeHtml(r.prUrl ?? "")}" target="_blank" rel="noopener">PR opened</a></li>`,
    )
    .join("\n        ");
  const failList = failed
    .map(
      (r) =>
        `<li><strong>${escapeHtml(r.repo)}</strong> — ${escapeHtml(r.error ?? "")}</li>`,
    )
    .join("\n        ");

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Install complete</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;line-height:1.5}h1{font-size:1.5rem}h2{font-size:1.1rem}.ok{color:#22863a}.fail{color:#cb2431}ul{padding-left:1.25rem}</style>
</head><body>
  <h1>Install complete</h1>
  <p>Your API key has been forwarded to each repo's GitHub Actions secrets and is no longer in this service's memory. Review and merge the PRs below to start scheduling scans.</p>
  ${ok.length > 0 ? `<h2 class="ok">PR opened (${ok.length})</h2><ul>${okList}</ul>` : ""}
  ${failed.length > 0 ? `<h2 class="fail">Failed (${failed.length})</h2><ul>${failList}</ul><p>You can re-visit the install URL to retry; secrets that succeeded won't be re-set.</p>` : ""}
  ${ok.length === 0 && failed.length === 0 ? "<p>No repos were attached to this install. Add some at GitHub → Applications → Configure → Repository access.</p>" : ""}
</body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
