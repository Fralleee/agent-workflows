# Deploying the installer (Vercel)

After you've registered the GitHub App per [github-app-registration.md](github-app-registration.md), follow this to ship the Vercel Edge function that backs `/setup`, `/install`, and `/webhook`.

## Prerequisites

- A Vercel account (free Hobby tier is enough for low traffic; see "Tier limits" below).
- [Bun](https://bun.com) installed locally (`curl -fsSL https://bun.sh/install | bash` on Unix; `powershell -c "irm bun.sh/install.ps1 | iex"` on Windows).
- The App's PEM private key, App ID, and webhook secret from the registration step.

## 1. Install the Vercel CLI + project deps

```bash
cd installer
bun install
```

`vercel` (the CLI) is in `devDependencies` so it's pinned and runnable via `bunx vercel`.

## 2. Set Framework Preset to "Other" in the project settings

When the project is first created, Vercel scans `package.json` and auto-detects **Hono** as the framework (because we depend on `hono`). The Hono preset expects a `src/index.ts` with `export default app` and tries to deploy that as a Node serverless function — which conflicts with our setup (Edge runtime, custom `api/index.ts` entry, no top-level default export).

In the project settings under **Build and Deployment → Framework Preset**, click **Override** and select **Other**. Save. With "Other", Vercel only deploys files in `api/*` as functions and respects our `vercel.json` rewrites.

This must be done before (or right after) the first deploy, otherwise every request returns `500: FUNCTION_INVOCATION_FAILED` with `Invalid export found in module "/var/task/installer/src/app.js"`.

## 3. Link the project from the repo root

**Important: link from the repo root, not from `installer/`.** Vercel's "Root Directory" setting (which we set to `installer` in the dashboard) is applied as a subdirectory of wherever the project is linked, so linking from `installer/` and then setting Root Directory = `installer` would make Vercel look for `installer/installer/` — non-existent.

From the **repo root** (one level up from `installer/`):

```bash
cd ..                  # if you're currently inside installer/
bunx vercel login
bunx vercel link
```

`vercel login` uses OAuth 2.0 Device Flow (since Feb 2026). It prints a one-time code and opens a browser tab to `vercel.com/oauth/device`; you confirm the location/IP/timestamp on the page and the CLI receives the token. Old email-based and `--github`/`--gitlab` flag flows have been removed — the unified device flow is the only path now.

`vercel link` either picks an existing project or creates a new one. Accept the defaults — Vercel auto-detects the project, and your dashboard Root Directory of `installer` directs it into the right subfolder for both CLI and git-pushed deploys.

The `installer/` package.json scripts (`bun run dev`, `bun run deploy`) pass `--cwd ..` to vercel so they work correctly from inside `installer/` while pointing at the repo-root-linked project.

## 4. Set Vercel environment variables

These are the runtime env vars the Edge function reads via `process.env`. Set each one — Vercel prompts for the value after running each command. **Required** values:

```bash
bunx vercel env add GITHUB_APP_ID
# Paste the numeric App ID from the registration step.
# Vercel asks: "Which environments?" → pick all three (Production, Preview, Development).

bunx vercel env add GITHUB_APP_PRIVATE_KEY
# Paste the entire PEM content, including the BEGIN/END lines.
# Vercel accepts multi-line input — paste then hit Enter.

bunx vercel env add GITHUB_WEBHOOK_SECRET
# Paste the same random string you typed into the App's "Webhook secret" field.
```

**Optional** overrides (defaults shown — only set if your slug or hub repo differs):

```bash
bunx vercel env add APP_SLUG          # default: agent-workflows
bunx vercel env add HUB_REPO          # default: Fralleee/agent-workflows
bunx vercel env add HUB_REF            # default: v1
bunx vercel env add LABEL              # default: auto:bug-scan
```

To verify (shows names only, not values):

```bash
bunx vercel env ls
```

## 5. Pull env vars locally for `vercel dev`

```bash
bunx vercel env pull .env.local
```

This writes the env vars into `.env.local` (gitignored) so `vercel dev` can run with the same secrets the deployed function uses.

## 6. Deploy

```bash
bun run deploy
```

(That runs `vercel deploy --prod`.) The CLI prints the production URL — something like `https://agent-workflows-installer.vercel.app`. **Copy it.**

For preview deploys (a unique URL per push, no production aliasing):

```bash
bun run deploy:preview
```

## 7. Wire the URLs back into the GitHub App config

Go back to your App's settings page on GitHub and set:

- **Callback URL** → `https://<your-vercel-url>/setup`
- **Setup URL** → `https://<your-vercel-url>/setup`
- **Webhook URL** → `https://<your-vercel-url>/webhook`

Save.

## 8. Smoke test

1. Visit `https://<your-vercel-url>/health` — should return `ok`.
2. Visit `https://<your-vercel-url>/` — should redirect to `https://github.com/apps/<APP_SLUG>/installations/new`.
3. Click through the install on a throwaway test repo.
4. Confirm the redirect to `/setup?installation_id=...` lands on the form.
5. Submit the form with a real (cheap) API key.
6. Verify in the test repo:
   - **Settings → Secrets and variables → Actions** lists the secret with the right name.
   - The label `auto:bug-scan` exists.
   - A PR was opened with `.github/workflows/daily-scan.yml`.

## 9. (Optional) Custom domain

Vercel gives you a free `*.vercel.app` subdomain. To use a custom domain:

1. Add the domain in the Vercel project: **Settings → Domains → Add**.
2. Point your DNS at Vercel per the instructions Vercel shows.
3. Wait for cert provisioning (~minutes).
4. Update the GitHub App's URLs to the custom domain.

## 10. (Optional) Marketplace listing

Phase 2 — submit the App for a public Marketplace listing. Requires:

- Verified-publisher status on the org.
- Privacy policy + ToS pages publicly reachable. Templates in [`docs/privacy-policy.md`](privacy-policy.md) and [`docs/terms-of-service.md`](terms-of-service.md).
- A few screenshots of the install flow.
- A short pitch + categorization.

Submit via the App's settings page → **Make this GitHub App public** → **List in Marketplace**. GitHub reviews in ~1–2 weeks.

## Tier limits to be aware of

| Limit | Hobby | Pro |
|---|---|---|
| Edge function execution time | **25s** per invocation | **60s** per invocation |
| Edge function size | 1 MB compressed | 4 MB compressed |
| Bandwidth | 100 GB/mo | 1 TB/mo |
| Daily invocations | 100k/day | 1M/day |

Our Edge function is ~50 KB and each repo install does ~7 GitHub API calls (~2–3s wall). On Hobby, an install spanning **~7+ repos in a single submit** could brush the 25s ceiling. Mitigations if you hit it:

- Lower the per-install concurrency (already capped at 4 in `installer/src/handlers/install.ts`).
- Prompt the user to install on fewer repos at a time.
- Upgrade to Pro for the 60s window.
- Move per-repo work into a background queue (Vercel KV + cron, or Vercel Queue) — not Phase 1.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/health` returns `404` | The `vercel.json` rewrite isn't in place. Re-deploy after confirming the file is committed. |
| `installation-token exchange failed: 401` | Wrong App ID, wrong private key, or the key/ID don't match. Re-set both env vars and redeploy. |
| `bad signature` on webhook deliveries | The webhook secret in GitHub doesn't match Vercel's `GITHUB_WEBHOOK_SECRET`. Re-set both. |
| Setup form loads but submit returns 500 | Tail the function logs: `bunx vercel logs <production-url> --follow`. Most often: the App lacks one of the required permissions. |
| `put secret failed: 403` | The App is missing `actions: write`. Update permissions, then have users re-accept on the install page. |
| Function exceeds 25s on Hobby | See "Tier limits" — install on fewer repos at a time, or upgrade to Pro. |

## Architecture notes

- **Runtime**: Edge runtime (`export const runtime = 'edge'` in `api/index.ts`). Cold starts are ~5–50ms — much faster than Node serverless functions on Vercel.
- **Routing**: `vercel.json` rewrites every non-`/api/*` path to the catch-all function at `api/index.ts`. Hono inside the function reads `request.url` (which Vercel preserves as the original `/setup`, `/install`, etc.) and dispatches.
- **Secrets**: All sensitive env vars are Vercel-managed. They never touch the repo. Locally, `vercel env pull` materializes them into `.env.local` (gitignored).
- **Statelessness**: The function persists nothing across requests. No KV, no DB. Each install is one HTTP request, scoped by the `installation_id` query parameter.
