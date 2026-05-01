// Idempotent label creation. The GitHub API returns 422 if the label already
// exists; we treat that as success.

const GITHUB_API = "https://api.github.com";

export async function ensureLabel(
  installToken: string,
  owner: string,
  repo: string,
  name: string,
): Promise<void> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/labels`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${installToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "agent-workflows-installer",
    },
    body: JSON.stringify({
      name,
      color: "ededed",
      description: "Bot-filed bug scan",
    }),
  });

  if (res.ok) return;
  if (res.status === 422) return; // already exists
  throw new Error(`ensure label failed: ${res.status} ${await res.text()}`);
}
