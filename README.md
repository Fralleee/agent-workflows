# agent-workflows

Daily AI bug-scanning for your GitHub repos. One click installs a workflow that runs Claude or GPT on a schedule, files high-confidence bug issues, and (optionally) opens fixes as draft PRs.

## Install — one click

[**→ Install Fralle Bug Scanner on your repo**](https://github.com/apps/fralle-bug-scanner/installations/new)

The install flow:

1. **Click Install.** GitHub asks which repos to grant access to.
2. **Pick an agent profile** on the setup page (Claude Sonnet 4.6 is the recommended default).
3. **Paste your Anthropic or OpenAI API key.** It is forwarded once to GitHub Actions Secrets and never persisted by this service.
4. **Merge the PR** that Fralle Bug Scanner opens on each repo. That's it — the cron starts running.

## What it does

| Workflow | What it does |
|---|---|
| [`daily-scan`](.github/workflows/daily-scan.yml) | Runs once a day. Surveys open issues + PRs labeled `auto:bug-scan`. Either files **one** new bug-scan issue or opens **one** draft PR fixing an existing one. |

The agent's behavior lives in [`prompts/daily-scan.md`](prompts/daily-scan.md). Edit there to tune what counts as a bug, what to skip, etc. Changes propagate to every consumer on its next scheduled run.

## How the agent figures out your repo

The workflow doesn't assume your stack. The agent itself does the discovery:

1. **House rules** — reads `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, or `.github/copilot-instructions.md` if present, and follows whatever conventions it finds.
2. **Toolchain** — picks bun/pnpm/yarn/npm based on which lockfile exists; the workflow pre-installs the matching runtime so the agent doesn't have to. Recognizes Cargo, Go, and Python project files too.
3. **Validation strategy** — looks for, in order:
   - `package.json` script named `validate` / `verify` / `ci` / `check`
   - Individual scripts (`typecheck`, `lint`, `test`) chained together
   - `Makefile` targets (`make check`, `make test`)
   - `cargo check && cargo test`
   - `pytest` / `ruff`
4. **No-toolchain repos** — if no validation can be discovered, the agent runs in **issue-only mode**. It will still file bug reports, but won't open auto-PRs.

You can override discovery with `validate-command:` if you need to.

## Agent profiles

The setup form picks one of these. Each profile maps to a `(provider, model, secret)` triple:

| Profile | Provider | Model | Secret name |
|---|---|---|---|
| **Claude Sonnet 4.6** *(recommended)* | anthropic | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |
| Claude Opus 4.7 | anthropic | `claude-opus-4-7` | `ANTHROPIC_API_KEY` |
| Claude Haiku 4.5 | anthropic | `claude-haiku-4-5` | `ANTHROPIC_API_KEY` |
| GPT-5 | openai | `gpt-5` | `OPENAI_API_KEY` |
| GPT-5 Mini | openai | `gpt-5-mini` | `OPENAI_API_KEY` |
| GPT-5 Codex | openai | `gpt-5-codex` | `OPENAI_API_KEY` |
| Custom (advanced) | (you pick) | (you pick) | (auto) |

You're billed by the chosen provider for the agent's daily activity.

## Power-user install (no GitHub App)

If you'd rather not install the App and prefer to manage your stub workflow by hand, drop this into your repo as `.github/workflows/daily-scan.yml` and set the matching secret:

```yaml
name: Daily bug scan
on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  scan:
    uses: Fralleee/agent-workflows/.github/workflows/daily-scan.yml@v1
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    with:
      provider: anthropic
      model: claude-sonnet-4-6
      enable-auto-pr: false
```

For OpenAI, swap `provider: openai`, `model: gpt-5`, and `OPENAI_API_KEY` for `ANTHROPIC_API_KEY`.

## Inputs

| Input | Default | Notes |
|---|---|---|
| `provider` | `anthropic` | `anthropic` (Claude Code) or `openai` (Codex). The matching secret must be set. |
| `model` | `""` → `claude-sonnet-4-6` (anthropic) / `gpt-5` (openai) | Any model id valid for the chosen provider. |
| `enable-auto-pr` | `false` | Start with `false`. Flip on per-repo once filed issues look good. |
| `scan-scope` | `changed-7d` | `changed-7d` (recent files only), `rotating` (one dir per weekday), `full` (everything). |
| `label` | `auto:bug-scan` | Label applied to all bot-created issues + PRs. |
| `validate-command` | `""` (auto-discover) | Override only if discovery picks the wrong thing. e.g. `bun run ci` or `make test-fast`. |

## Phased rollout (recommended)

1. **Week 1:** install with `enable-auto-pr: false`. Let it file issues. Read them.
2. **Week 2:** if ≥4/5 issues are real bugs, flip `enable-auto-pr: true`.
3. **Branch protection** on `main` + required reviews keeps any auto-PR gated regardless.

## Versioning

- Pin consumers to `@v1` for stability.
- Breaking prompt or interface changes → bump to `v2`.
- Tweaks → push to `main`, tag `v1.N`, point `v1` at the new tag.

## Repo layout

```
.github/workflows/
  daily-scan.yml      # the reusable workflow consumers call
  lint.yml            # CI: actionlint + installer typecheck/test
prompts/
  daily-scan.md       # the agent's instructions
installer/
  src/, test/         # Vercel Edge function that powers the GitHub App's setup flow
docs/
  github-app-registration.md
  deployment.md
  privacy-policy.md
  terms-of-service.md
```

## Self-hosting / running your own fork

If you want to run your own GitHub App against this code (different org, different agent profile catalog, etc.):

1. Read [`docs/github-app-registration.md`](docs/github-app-registration.md) and register your own App.
2. Read [`docs/deployment.md`](docs/deployment.md) and deploy your own Vercel Edge function.
3. Edit [`installer/src/profiles.ts`](installer/src/profiles.ts) if you want a different model catalog.
4. Set the `APP_SLUG` env var on your Vercel project to your App's slug (defaults to `agent-workflows`).

## Troubleshooting

- **Action exits without filing anything** — normal on a quiet day. Check the log for the summary line.
- **Same bug re-filed every day** — dedup is broken; check the previous issue still has the `auto:bug-scan` label.
- **Auto-PR opens broken PRs** — the discovered validate command isn't catching the issue. Override with `validate-command:`.
- **Agent says "no validation strategy discovered"** — your repo has no test/lint/check script, so PRs can't be safely auto-generated. Either add a `npm run check`-style script or pass `validate-command: "true"` to opt out of the safety gate.
- **Cost runs hot** — switch `scan-scope` to `rotating` or pick a cheaper agent profile (Haiku or GPT-5 Mini).
