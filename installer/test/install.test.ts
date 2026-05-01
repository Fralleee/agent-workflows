// runInstall orchestration tests. We inject a fake GitHubClient so these
// tests focus on the orchestration: which steps fire, in what order, with
// what arguments, and how per-repo failures are isolated. HTTP-level
// behavior of the real client lives in client.test.ts.

import { describe, expect, it } from "bun:test";
import { runInstall } from "../src/handlers/install.js";
import type { InstallEnv, InstallFormData } from "../src/handlers/install.js";
import type {
  GitHubClient,
  OpenSingleFilePrOptions,
  PrResult,
  RepoSummary,
} from "../src/github/client.js";

const ENV: InstallEnv = {
  GITHUB_APP_ID: "111",
  GITHUB_APP_PRIVATE_KEY: "fake-not-used-with-injected-client",
  HUB_REPO: "Fralleee/agent-workflows",
  HUB_REF: "v1",
  LABEL: "auto:bug-scan",
};

const FORM: InstallFormData = {
  installationId: 42,
  profileId: "claude-sonnet",
  apiKey: "sk-ant-test-NEVER-LOG-ME-1234",
  enableAutoPr: false,
};

const TWO_REPOS: RepoSummary[] = [
  { id: 1, name: "alpha", full_name: "octocat/alpha", default_branch: "main", owner: { login: "octocat" } },
  { id: 2, name: "beta",  full_name: "octocat/beta",  default_branch: "main", owner: { login: "octocat" } },
];

interface RecordedCall {
  method: keyof GitHubClient;
  args: unknown[];
}

interface FakeClient extends GitHubClient {
  calls: RecordedCall[];
}

function makeFakeClient(opts: {
  repos?: RepoSummary[];
  failRepo?: string;
  failOn?: keyof GitHubClient;
} = {}): FakeClient {
  const calls: RecordedCall[] = [];
  const repos = opts.repos ?? TWO_REPOS;
  const maybeFail = (method: keyof GitHubClient, repo: string) => {
    if (opts.failOn === method && opts.failRepo === repo) {
      throw new Error(`simulated ${method} failure on ${repo}`);
    }
  };
  return {
    calls,
    async listInstallationRepos() {
      calls.push({ method: "listInstallationRepos", args: [] });
      return repos;
    },
    async ensureLabel(owner, repo, name) {
      calls.push({ method: "ensureLabel", args: [owner, repo, name] });
      maybeFail("ensureLabel", repo);
    },
    async putRepoSecret(owner, repo, name, value) {
      calls.push({ method: "putRepoSecret", args: [owner, repo, name, value] });
      maybeFail("putRepoSecret", repo);
      return { created: true };
    },
    async openSingleFilePr(prOpts: OpenSingleFilePrOptions): Promise<PrResult> {
      calls.push({ method: "openSingleFilePr", args: [prOpts] });
      maybeFail("openSingleFilePr", prOpts.repo);
      return {
        url: `https://github.com/${prOpts.owner}/${prOpts.repo}/pull/7`,
        number: 7,
      };
    },
  };
}

describe("runInstall", () => {
  it("opens a PR for every repo on the happy path", async () => {
    const client = makeFakeClient();
    const results = await runInstall(FORM, ENV, client);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.prUrl)).toBe(true);
    expect(results.every((r) => !r.error)).toBe(true);
  });

  it("calls each step exactly once per repo", async () => {
    const client = makeFakeClient();
    await runInstall(FORM, ENV, client);
    const counts: Record<string, number> = {};
    for (const c of client.calls) counts[c.method] = (counts[c.method] ?? 0) + 1;
    expect(counts).toEqual({
      listInstallationRepos: 1,
      ensureLabel: 2,
      putRepoSecret: 2,
      openSingleFilePr: 2,
    });
  });

  it("isolates per-repo failures (one repo dies, the other still ships)", async () => {
    const client = makeFakeClient({ failRepo: "alpha", failOn: "openSingleFilePr" });
    const results = await runInstall(FORM, ENV, client);
    const alpha = results.find((r) => r.repo === "octocat/alpha");
    const beta = results.find((r) => r.repo === "octocat/beta");
    expect(alpha?.error).toMatch(/openSingleFilePr failure on alpha/);
    expect(alpha?.prUrl).toBeUndefined();
    expect(beta?.prUrl).toBeTruthy();
    expect(beta?.error).toBeUndefined();
  });

  it("uses the custom (provider, model) if profile=custom", async () => {
    const client = makeFakeClient();
    await runInstall(
      { ...FORM, profileId: "custom", customProvider: "openai", customModel: "gpt-5-thinking" },
      ENV,
      client,
    );
    const prCall = client.calls.find((c) => c.method === "openSingleFilePr");
    expect(prCall).toBeDefined();
    const opts = prCall!.args[0] as OpenSingleFilePrOptions;
    expect(opts.fileContent).toContain("provider: openai");
    expect(opts.fileContent).toContain("model: gpt-5-thinking");
    expect(opts.fileContent).toContain("OPENAI_API_KEY");
  });

  it("forwards the API key plaintext to putRepoSecret (encryption is the client's job)", async () => {
    const client = makeFakeClient();
    await runInstall(FORM, ENV, client);
    const secretCall = client.calls.find((c) => c.method === "putRepoSecret");
    expect(secretCall).toBeDefined();
    expect(secretCall!.args[3]).toBe(FORM.apiKey);
    // The "plaintext doesn't reach the wire" invariant is owned by
    // HttpGitHubClient + sealed-box and tested in client.test.ts.
  });

  it("sets the right title, paths, and commit messages on the install PR", async () => {
    const client = makeFakeClient();
    await runInstall(FORM, ENV, client);
    const opts = client.calls.find((c) => c.method === "openSingleFilePr")!.args[0] as OpenSingleFilePrOptions;
    expect(opts.prTitle).toBe("ci: add daily bug-scan agent");
    expect(opts.commitMessageNew).toBe("ci: add daily bug-scan agent");
    expect(opts.commitMessageUpdate).toBe("ci: update daily bug-scan agent config");
    expect(opts.filePath).toBe(".github/workflows/daily-scan.yml");
  });
});
