// Generates the consumer-repo workflow stub that the App opens a PR with.
// The output must match the hand-written examples in the project README; a
// golden-file test in test/stub.test.ts pins the bytes for every profile.

import type { Provider } from "./profiles.js";

export interface StubOptions {
  hubRepo: string;     // e.g. "Fralleee/agent-workflows"
  hubRef: string;      // e.g. "v1"
  provider: Provider;
  model: string;
  secretName: "ANTHROPIC_API_KEY" | "OPENAI_API_KEY";
  enableAutoPr: boolean;
}

export function renderStub(opts: StubOptions): string {
  return `name: Daily bug scan
on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

jobs:
  scan:
    uses: ${opts.hubRepo}/.github/workflows/daily-scan.yml@${opts.hubRef}
    secrets:
      ${opts.secretName}: \${{ secrets.${opts.secretName} }}
    with:
      provider: ${opts.provider}
      model: ${opts.model}
      enable-auto-pr: ${opts.enableAutoPr}
      # Defaults below — uncomment and edit only if you need to override.
      # scan-scope: "changed-7d"        # changed-7d | full | rotating
      # validate-command: ""             # if empty, agent auto-discovers
`;
}
