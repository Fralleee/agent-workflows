import { describe, expect, it } from "bun:test";
import { renderStub } from "../src/stub.js";

const COMMON = {
  hubRepo: "Fralleee/agent-workflows",
  hubRef: "v1",
} as const;

describe("renderStub", () => {
  it("anthropic profile produces the expected YAML byte-for-byte", () => {
    const out = renderStub({
      ...COMMON,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      secretName: "ANTHROPIC_API_KEY",
      enableAutoPr: false,
    });
    expect(out).toBe(`name: Daily bug scan
on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

# The reusable workflow needs to file issues, open PRs, and (in fix mode)
# push branches. The caller has to grant those — reusable workflows can
# only request permissions, not raise them above the caller's scope.
permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  scan:
    uses: Fralleee/agent-workflows/.github/workflows/daily-scan.yml@v1
    secrets:
      ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
    with:
      provider: anthropic
      model: claude-sonnet-4-6
      enable-auto-pr: false
      # Defaults below — uncomment and edit only if you need to override.
      # scan-scope: "changed-7d"        # changed-7d | full | rotating
      # validate-command: ""             # if empty, agent auto-discovers
`);
  });

  it("openai profile + auto-pr=true reflects correctly", () => {
    const out = renderStub({
      ...COMMON,
      provider: "openai",
      model: "gpt-5",
      secretName: "OPENAI_API_KEY",
      enableAutoPr: true,
    });
    expect(out).toContain("provider: openai");
    expect(out).toContain("model: gpt-5");
    expect(out).toContain("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}");
    expect(out).toContain("enable-auto-pr: true");
  });

  it("preserves the GHA expression literal — no double-escaping", () => {
    const out = renderStub({
      ...COMMON,
      provider: "anthropic",
      model: "claude-haiku-4-5",
      secretName: "ANTHROPIC_API_KEY",
      enableAutoPr: false,
    });
    // The dollar-curly expression must appear once, unescaped, so GHA picks it up.
    const matches = out.match(/\$\{\{ secrets\.ANTHROPIC_API_KEY \}\}/g);
    expect(matches).toHaveLength(1);
    expect(out).not.toContain("\\${{");
  });
});
