// Opens a PR adding `.github/workflows/daily-scan.yml` on a fresh branch.
//
// Uses the high-level Contents API (`PUT /repos/.../contents/...`) which
// atomically creates the branch (via the `branch` field) and commits the file
// in one call. We then open the PR with `POST /repos/.../pulls`.

const GITHUB_API = "https://api.github.com";

export interface PrResult {
  url: string;
  number: number;
}

export async function openInstallPr(args: {
  installToken: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  fileContent: string;
  branchName?: string;
}): Promise<PrResult> {
  const branch = args.branchName ?? `agent-workflows/install-${Date.now()}`;
  const path = ".github/workflows/daily-scan.yml";
  const headers = {
    Authorization: `Bearer ${args.installToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "agent-workflows-installer",
  } satisfies Record<string, string>;

  // 1) Create the branch from the default branch's tip.
  const refRes = await fetch(
    `${GITHUB_API}/repos/${args.owner}/${args.repo}/git/ref/heads/${args.defaultBranch}`,
    { headers },
  );
  if (!refRes.ok) {
    throw new Error(`get default ref failed: ${refRes.status} ${await refRes.text()}`);
  }
  const refJson = (await refRes.json()) as { object: { sha: string } };
  const baseSha = refJson.object.sha;

  const createRefRes = await fetch(
    `${GITHUB_API}/repos/${args.owner}/${args.repo}/git/refs`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    },
  );
  if (!createRefRes.ok && createRefRes.status !== 422 /* already exists */) {
    throw new Error(`create ref failed: ${createRefRes.status} ${await createRefRes.text()}`);
  }

  // 2) Commit the file onto the new branch.
  const contentB64 = btoa(unescape(encodeURIComponent(args.fileContent)));
  const putRes = await fetch(
    `${GITHUB_API}/repos/${args.owner}/${args.repo}/contents/${path}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: "ci: add daily bug-scan agent",
        content: contentB64,
        branch,
      }),
    },
  );
  if (!putRes.ok) {
    throw new Error(`put contents failed: ${putRes.status} ${await putRes.text()}`);
  }

  // 3) Open the PR.
  const prRes = await fetch(
    `${GITHUB_API}/repos/${args.owner}/${args.repo}/pulls`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "ci: add daily bug-scan agent",
        head: branch,
        base: args.defaultBranch,
        body: prBody(),
      }),
    },
  );
  if (!prRes.ok) {
    throw new Error(`open PR failed: ${prRes.status} ${await prRes.text()}`);
  }
  const prJson = (await prRes.json()) as { number: number; html_url: string };
  return { url: prJson.html_url, number: prJson.number };
}

function prBody(): string {
  return `Adds the \`daily-scan\` reusable workflow to this repo. Once merged, it runs once a day and either files a bug-scan issue or opens a draft PR for one.

The agent itself decides what counts as a bug, what to skip, and whether your repo has a validation strategy that allows auto-PRs.

You can:
- **Adjust the schedule** — edit the \`cron\` line.
- **Switch agent profile** — change \`provider:\` and \`model:\`.
- **Enable auto-PR** — flip \`enable-auto-pr\` to \`true\` after a few weeks of issue-only mode.
- **Override validation** — set \`validate-command\` if discovery picks the wrong thing.

Filed automatically by the agent-workflows installer.`;
}
