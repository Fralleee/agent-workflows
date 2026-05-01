// POST /install — orchestrator. For each repo the installation covers:
//   1) ensure label
//   2) PUT actions secret (API key, encrypted with sealed_box)
//   3) open PR adding .github/workflows/daily-scan.yml
// Per-repo failures are isolated. Returns RepoResult[] from runInstall;
// renderInstallResults wraps the view in a Response.

import { resolveProfile, type Provider } from "../profiles.js";
import { renderStub } from "../stub.js";
import { createGitHubClient, type GitHubClient } from "../github/client.js";
import { installResultPageHtml } from "../views/install-result-page.js";

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

const STUB_PATH = ".github/workflows/daily-scan.yml";
const PR_TITLE = "ci: add daily bug-scan agent";
const COMMIT_MESSAGE_NEW = "ci: add daily bug-scan agent";
const COMMIT_MESSAGE_UPDATE = "ci: update daily bug-scan agent config";

export async function runInstall(
  form: InstallFormData,
  env: InstallEnv,
  // For tests: inject a fake client. In production, the default factory
  // mints a real client via JWT signing + token exchange.
  client?: GitHubClient,
): Promise<RepoResult[]> {
  const { provider, model, secretName } = resolveProfile(
    form.profileId,
    form.customProvider && form.customModel
      ? { provider: form.customProvider, model: form.customModel }
      : undefined,
  );

  const c =
    client ??
    (await createGitHubClient({
      appId: env.GITHUB_APP_ID,
      privateKeyPem: env.GITHUB_APP_PRIVATE_KEY,
      installationId: form.installationId,
    }));

  const repos = await c.listInstallationRepos();

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
      await c.ensureLabel(owner, repo.name, env.LABEL);
      await c.putRepoSecret(owner, repo.name, secretName, form.apiKey);
      const pr = await c.openSingleFilePr({
        owner,
        repo: repo.name,
        defaultBranch: repo.default_branch,
        filePath: STUB_PATH,
        fileContent: stub,
        prTitle: PR_TITLE,
        prBody: installPrBody(),
        commitMessageNew: COMMIT_MESSAGE_NEW,
        commitMessageUpdate: COMMIT_MESSAGE_UPDATE,
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

function installPrBody(): string {
  return `Adds the \`daily-scan\` reusable workflow to this repo. Once merged, it runs once a day and either files a bug-scan issue or opens a draft PR for one.

The agent itself decides what counts as a bug, what to skip, and whether your repo has a validation strategy that allows auto-PRs.

You can:
- **Adjust the schedule** — edit the \`cron\` line.
- **Switch agent profile** — change \`provider:\` and \`model:\`.
- **Enable auto-PR** — flip \`enable-auto-pr\` to \`true\` after a few weeks of issue-only mode.
- **Override validation** — set \`validate-command\` if discovery picks the wrong thing.

Filed automatically by the agent-workflows installer.`;
}

export function renderInstallResults(results: RepoResult[]): Response {
  return new Response(installResultPageHtml(results), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    },
  });
}
