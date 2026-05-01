# installer

A Vercel Edge function that backs the **agent-workflows GitHub App**. After a user installs the App on their repos, GitHub redirects them to `/setup` here; they pick an agent profile, paste their API key, and the function:

1. Sets the matching repository Actions secret (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) — the key is in memory for one HTTP request and never persisted.
2. Creates the `auto:bug-scan` label.
3. Opens a PR adding `.github/workflows/daily-scan.yml` to each selected repo, pinned to the right `provider:` and `model:`.

The reusable workflow itself lives at `../.github/workflows/daily-scan.yml` and is what the stub PR points at.

## Local development

This project uses [Bun](https://bun.com) for package management and the test runner. Install Bun first if you don't have it.

```bash
cd installer
bun install
bun test                  # bun's native test runner (runtime-agnostic test cases)
bun run typecheck         # tsc --noEmit
bun run dev:preview       # standalone Bun server — fast visual review, no Vercel/GitHub setup
bun run dev               # vercel dev — full-stack local Edge function (needs vercel link + env)
```

### Visual preview (`bun run dev:preview`)

The fastest way to see the setup form. Boots [`scripts/dev.ts`](scripts/dev.ts), which imports the Hono app directly and runs it on Bun's native HTTP server with `--hot` reload.

```bash
bun run dev:preview
# agent-workflows installer (preview) running at http://localhost:3000/
#   → setup form: http://localhost:3000/setup?installation_id=12345
```

Open the setup form URL — the dropdown, the reactive API-key label, and the custom-profile fields all work end-to-end. `POST /install` will fail (the App private key is fake), which itself is useful: it exercises the error-rendering branch.

### Full-stack local (`bun run dev`)

Runs `vercel dev`, which mirrors production routing (`vercel.json` rewrites, runtime, env). Requires `bunx vercel link` to associate the directory with a Vercel project and `bunx vercel env pull .env.local` to materialize the App's real secrets. See [`../docs/deployment.md`](../docs/deployment.md) for the full handoff.

## Deploy

```bash
bun run deploy            # vercel deploy --prod
bun run deploy:preview    # vercel deploy (preview URL)
```

Set env vars one-time via `bunx vercel env add` — see the deployment doc.

## File map

```
api/
  index.ts         Vercel Edge entry. Reads process.env, builds the app, exports GET/POST.

src/
  app.ts                 Hono application factory — runtime-independent.
  profiles.ts            Curated agent profiles (Claude/GPT) shown in the dropdown.
  stub.ts                Renders the consumer-repo workflow YAML stub.
  github/
    app-auth.ts          RS256 JWT + installation token (no Octokit, just fetch).
    secrets.ts           Manual crypto_box_seal (tweetnacl + @noble/hashes/blake2b) + PUT /actions/secrets.
    label.ts             POST /labels (idempotent on 422).
    pr.ts                Branch + commit + open PR via Contents API.
  handlers/
    setup.ts             GET /setup — renders the form. /setup.js — small toggle script.
                         (HTML and JS are inlined here, no separate static files.)
    install.ts           POST /install — orchestrator + result-page renderer.
    webhook.ts           POST /webhook — HMAC verification, no-op ack.

test/
  profiles.test.ts       Catalog invariants + resolveProfile().
  stub.test.ts           Golden YAML output for representative profiles.
  secrets.test.ts        sealed_box round-trip with a known keypair.
  webhook.test.ts        HMAC accept/reject paths.
  app-auth.test.ts       JWT structure, signature shape.
  install.test.ts        Orchestrator end-to-end (globalThis.fetch swapped per-test).

scripts/
  dev.ts                 Standalone Bun dev server — `bun run dev:preview`.

bun.lock                 Bun lockfile. Used by `bun install --frozen-lockfile` in CI.

vercel.json              Rewrites every non-/api/ path to the catch-all function.
```

## Routing

We want clean URLs (`/setup`, `/install`, `/webhook`) rather than `/api/setup` etc., so [`vercel.json`](vercel.json) rewrites every non-`/api/*` path to `/api`, which Vercel resolves to `api/index.ts`. Vercel preserves the original URL in `request.url`, so Hono inside the function dispatches based on the user-facing path. The result: GitHub sees `https://yoursite.vercel.app/setup` and the function gets `/setup` to route on.

## Why Edge runtime (not Node)

- Closer to the existing code (we use WebCrypto extensively for RS256 signing and HMAC verification).
- Faster cold starts (~5–50ms vs ~200–500ms for Node serverless).
- Smaller bundle limits (1 MB Hobby) — we're at ~50 KB so room to spare.
- The 25s execution cap on Hobby is the only watch-out; see deployment doc.
