# agent-workflows

Reusable GitHub Actions that run Claude Code as a scheduled agent across all my repos.

## What's here

| Workflow | What it does |
|---|---|
| [`daily-scan`](.github/workflows/daily-scan.yml) | Runs once a day. Surveys open issues + PRs labeled `auto:bug-scan`. Either files a new bug-scan issue or opens a draft PR fixing an existing one. One action per run, max. |

The agent's behavior lives in [`prompts/daily-scan.md`](prompts/daily-scan.md). Edit there to tune what counts as a bug, what to skip, etc. Changes propagate to every consumer on its next scheduled run.

## How the agent figures out your repo

The workflow doesn't assume your stack. The agent itself does the discovery:

1. **House rules** — reads `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, or `.github/copilot-instructions.md` if present, and follows whatever conventions it finds (commit style, package manager, framework idioms).
2. **Toolchain** — picks bun/pnpm/yarn/npm based on which lockfile exists. Recognizes Cargo, Go, and Python project files too.
3. **Validation strategy** — looks for, in order:
   - `package.json` script named `validate` / `verify` / `ci` / `check`
   - Individual scripts (`typecheck`, `lint`, `test`) chained together
   - `Makefile` targets (`make check`, `make test`)
   - `cargo check && cargo test`
   - `pytest` / `ruff`
4. **No-toolchain repos** — if no validation can be discovered, the agent runs in **issue-only mode** for that repo. It will still file bug reports, but won't open auto-PRs (it has no way to verify the fix is safe).

You can override discovery with `validate-command:` if you need to.

## Install in a new repo

From inside the target repo:

```bash
curl -fsSL https://raw.githubusercontent.com/Fralleee/agent-workflows/main/scripts/install.sh | bash
```

That script:
1. Creates the `auto:bug-scan` label.
2. Prompts you to set the `ANTHROPIC_API_KEY` secret.
3. Drops `.github/workflows/daily-scan.yml` (a minimal stub that calls this hub repo).

Then commit the stub and trigger once manually:

```bash
git add .github/workflows/daily-scan.yml && git commit -m "ci: add daily bug-scan agent" && git push
gh workflow run daily-scan.yml
gh run watch
```

## Stub workflow shape

The install script writes this. For most repos no edits are needed — the agent figures everything out:

```yaml
name: Daily bug scan
on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

jobs:
  scan:
    uses: Fralleee/agent-workflows/.github/workflows/daily-scan.yml@v1
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    with:
      enable-auto-pr: false
```

## Inputs

| Input | Default | Notes |
|---|---|---|
| `enable-auto-pr` | `false` | Start with `false`. Flip on per-repo once filed issues look good. Forced to off if no validation strategy exists. |
| `scan-scope` | `changed-7d` | `changed-7d` (recent files only), `rotating` (one dir per weekday), `full` (everything). |
| `model` | `claude-sonnet-4-6` | Any Anthropic model id. |
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

## Troubleshooting

- **"label already exists"** — fine, the install script is idempotent.
- **Action exits without filing or opening anything** — that's normal on a quiet day. Check the log for the summary line ("No high-confidence bug found", etc.).
- **Action keeps re-filing the same bug** — dedup is broken; check that the previous issue still has the `auto:bug-scan` label and is still open.
- **Auto-PR mode opens broken PRs** — it shouldn't (validation gates it). If it does, the discovered validate command isn't catching the issue. Override with `validate-command:` to point at a stricter command.
- **Agent says "no validation strategy discovered"** — your repo has no test/lint/check script, so PRs can't be safely auto-generated. Either add a script (e.g. `npm run check`) or pass `validate-command: "true"` explicitly to opt out of the safety gate.
- **Cost runs hot** — switch `scan-scope` to `rotating` or set `model` to a cheaper one.
