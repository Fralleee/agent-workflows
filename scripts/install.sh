#!/usr/bin/env bash
# Per-repo prereq setup for the daily-scan reusable workflow.
# Run this once inside the consumer repo (where `gh repo view` resolves to it).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Fralleee/agent-workflows/main/scripts/install.sh | bash
#
# What this does:
#   1. Creates the `auto:bug-scan` label (idempotent).
#   2. Prompts you to set the ANTHROPIC_API_KEY secret.
#   3. Drops a stub workflow at .github/workflows/daily-scan.yml if missing.

set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI not found. Install from https://cli.github.com/ first." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh CLI is not authenticated. Run 'gh auth login' first." >&2
  exit 1
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "Configuring $REPO ..."

LABEL="${LABEL:-auto:bug-scan}"
echo "  → ensuring label '$LABEL' exists"
gh label create "$LABEL" --color ededed --description "Bot-filed bug scan" 2>/dev/null \
  || echo "    (label already exists, skipping)"

if gh secret list | grep -q '^ANTHROPIC_API_KEY'; then
  echo "  → secret ANTHROPIC_API_KEY already set, skipping"
else
  echo "  → setting secret ANTHROPIC_API_KEY (paste value when prompted)"
  gh secret set ANTHROPIC_API_KEY
fi

STUB=".github/workflows/daily-scan.yml"
if [ -f "$STUB" ]; then
  echo "  → $STUB already exists, leaving it alone"
else
  echo "  → writing stub $STUB"
  mkdir -p "$(dirname "$STUB")"
  cat > "$STUB" <<'YAML'
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
      # Defaults below — uncomment and edit only if you need to override.
      # scan-scope: "changed-7d"        # changed-7d | full | rotating
      # model: "claude-sonnet-4-6"
      # validate-command: ""             # if empty, agent auto-discovers
YAML
  echo "    no edits needed for most repos — agent auto-detects stack and validation"
fi

echo
echo "Done. Next:"
echo "  1. Review/commit $STUB"
echo "  2. Trigger via: gh workflow run daily-scan.yml"
echo "  3. Watch: gh run watch"
