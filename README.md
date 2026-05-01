# agent-workflows

Daily AI bug-scanning for your GitHub repos. Click install, pick a profile, paste an API key — a workflow runs Claude or GPT on a daily cron, files real bug issues, and (optionally) opens fixes as draft PRs.

[**→ Install Fralle Bug Scanner**](https://github.com/apps/fralle-bug-scanner/installations/new)

## How it works

The App opens a PR adding [`.github/workflows/daily-scan.yml`](.github/workflows/daily-scan.yml) to your repo. Once merged, the workflow runs once a day and either files **one** new issue labeled `auto:bug-scan` or opens **one** draft PR fixing an existing one — never both, never more.

The agent self-discovers your repo on every run:

- Reads `AGENTS.md` / `CLAUDE.md` / `.cursorrules` for house rules.
- Picks bun / pnpm / yarn / npm from the lockfile, or Cargo / Go / Python from project files.
- Finds a validation command: `package.json` scripts (`validate`, `verify`, `ci`, `check`, or chained `typecheck && lint && test`), `Makefile` targets, `cargo check && cargo test`, `pytest` / `ruff`. No validation discovered → issue-only mode (auto-PRs are disabled regardless).

Prompt lives at [`prompts/daily-scan.md`](prompts/daily-scan.md); edits there propagate to every consumer on the next scheduled run.

## Agent profiles

| Profile | Provider | Model | Secret |
|---|---|---|---|
| **Claude Sonnet 4.6** *(recommended)* | anthropic | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |
| Claude Opus 4.7 | anthropic | `claude-opus-4-7` | `ANTHROPIC_API_KEY` |
| Claude Haiku 4.5 | anthropic | `claude-haiku-4-5` | `ANTHROPIC_API_KEY` |
| GPT-5 | openai | `gpt-5` | `OPENAI_API_KEY` |
| GPT-5 Mini | openai | `gpt-5-mini` | `OPENAI_API_KEY` |
| GPT-5 Codex | openai | `gpt-5-codex` | `OPENAI_API_KEY` |
| Custom | — | (you pick) | auto |

You're billed by the chosen provider.

## Inputs

| Input | Default | Notes |
|---|---|---|
| `provider` | `anthropic` | `anthropic` or `openai`. |
| `model` | per-provider default | Any model id valid for the provider. |
| `enable-auto-pr` | `false` | Start off; flip on after a few weeks of issues looking good. |
| `scan-scope` | `changed-7d` | `changed-7d` / `rotating` / `full`. |
| `label` | `auto:bug-scan` | Label on bot-created issues + PRs. |
| `validate-command` | (auto-discover) | Override discovery, e.g. `bun run ci`. |

## Manual install (no GitHub App)

Drop this at `.github/workflows/daily-scan.yml` and set the matching secret:

```yaml
name: Daily bug scan
on:
  schedule: [{ cron: "0 6 * * *" }]
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
      enable-auto-pr: false
```

For OpenAI: swap `provider: openai` and the secret name to `OPENAI_API_KEY`.

## Self-hosting

Run your own GitHub App + Vercel Edge function:

1. Register the App per [`docs/github-app-registration.md`](docs/github-app-registration.md).
2. Deploy per [`docs/deployment.md`](docs/deployment.md).
3. Optional: edit [`installer/src/profiles.ts`](installer/src/profiles.ts) for a different model catalog.

## Versioning

Pin to `@v1`. Patch fixes move `v1` forward; breaking interface changes bump to `v2`.

## Troubleshooting

- **Quiet day** — agent exits without filing. Look for the one-line summary in the run log.
- **Same bug re-filed daily** — check the previous issue still has the `auto:bug-scan` label (dedup keys off it).
- **Auto-PR opens broken PRs** — your discovered validate command isn't strict enough. Override with `validate-command:`.
- **"No validation strategy discovered"** — repo has no test/check script. Either add one or pass `validate-command: "true"` to opt out of the safety gate.
- **Cost runs hot** — switch to `scan-scope: rotating` or pick Haiku / GPT-5 Mini.
