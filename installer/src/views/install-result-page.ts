// Install-result page — rendered after POST /install. Shows the per-repo
// outcomes (PR opened or failure reason) plus a reminder that the API key
// has been forwarded and discarded.

import { escapeHtml } from "./html.js";

// Structurally compatible with handlers/install.ts's RepoResult. Defining
// the input shape locally keeps the view from depending on the orchestrator.
export interface RepoOutcome {
  repo: string;
  prUrl?: string;
  error?: string;
}

export function installResultPageHtml(results: RepoOutcome[]): string {
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

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Install complete</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;line-height:1.5}h1{font-size:1.5rem}h2{font-size:1.1rem}.ok{color:#22863a}.fail{color:#cb2431}ul{padding-left:1.25rem}@media(prefers-color-scheme:dark){body{background:#0f1014;color:#f1f1f4}}</style>
</head><body>
  <h1>Install complete</h1>
  <p>Your API key has been forwarded to each repo's GitHub Actions secrets and is no longer in this service's memory. Review and merge the PRs below to start scheduling scans.</p>
  ${ok.length > 0 ? `<h2 class="ok">PR opened (${ok.length})</h2><ul>${okList}</ul>` : ""}
  ${failed.length > 0 ? `<h2 class="fail">Failed (${failed.length})</h2><ul>${failList}</ul><p>You can re-visit the install URL to retry; secrets that succeeded won't be re-set.</p>` : ""}
  ${ok.length === 0 && failed.length === 0 ? "<p>No repos were attached to this install. Add some at GitHub → Applications → Configure → Repository access.</p>" : ""}
</body></html>`;
}
