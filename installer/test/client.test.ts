// HttpGitHubClient HTTP-level tests. The orchestrator's tests
// (install.test.ts) inject a fake satisfying the GitHubClient interface, so
// the URL/header/body details of the real client are tested here, not there.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import nacl from "tweetnacl";
import { HttpGitHubClient } from "../src/github/client.js";

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface RecordedCall {
  url: string;
  method: string;
  body?: string;
}

function captureFetch(
  handler: (call: RecordedCall) => Response | Promise<Response>,
): RecordedCall[] {
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u =
      typeof url === "string"
        ? url
        : url instanceof URL
          ? url.toString()
          : url.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : undefined;
    const call: RecordedCall = { url: u, method, ...(body !== undefined ? { body } : {}) };
    calls.push(call);
    return handler(call);
  }) as typeof globalThis.fetch;
  return calls;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("HttpGitHubClient.openSingleFilePr", () => {
  const client = new HttpGitHubClient("test-token");
  const baseOpts = {
    owner: "octocat",
    repo: "alpha",
    defaultBranch: "main",
    filePath: ".github/workflows/daily-scan.yml",
    fileContent: "name: test\n",
    prTitle: "test pr",
    prBody: "body",
    commitMessageNew: "ci: add",
    commitMessageUpdate: "ci: update",
    branchName: "test-branch",
  };

  it("omits sha and uses 'new' commit message when file does not exist (404)", async () => {
    const calls = captureFetch((call) => {
      if (call.url.includes("/git/ref/heads/")) return json({ object: { sha: "deadbeef" } });
      if (call.url.endsWith("/git/refs") && call.method === "POST") return new Response(null, { status: 201 });
      if (/\/contents\/.+\?ref=/.test(call.url) && call.method === "GET") return new Response(null, { status: 404 });
      if (/\/contents\/.+$/.test(call.url) && call.method === "PUT") return json({});
      if (call.url.endsWith("/pulls") && call.method === "POST") {
        return json({ number: 7, html_url: "https://github.com/octocat/alpha/pull/7" });
      }
      throw new Error(`unmocked ${call.method} ${call.url}`);
    });

    await client.openSingleFilePr(baseOpts);

    const putContents = calls.find(
      (c) => c.method === "PUT" && c.url.includes("/contents/") && !c.url.includes("?ref="),
    );
    expect(putContents).toBeDefined();
    const body = JSON.parse(putContents!.body!);
    expect(body.sha).toBeUndefined();
    expect(body.message).toBe("ci: add");
  });

  it("supplies sha and uses 'update' commit message when file exists (re-install path)", async () => {
    // Regression test for the bug where re-installing on a repo with an
    // already-merged install PR caused PUT contents to fail with 422
    // "sha wasn't supplied".
    const calls = captureFetch((call) => {
      if (call.url.includes("/git/ref/heads/")) return json({ object: { sha: "deadbeef" } });
      if (call.url.endsWith("/git/refs") && call.method === "POST") return new Response(null, { status: 201 });
      if (/\/contents\/.+\?ref=/.test(call.url) && call.method === "GET") return json({ sha: "existing-sha-abc123" });
      if (/\/contents\/.+$/.test(call.url) && call.method === "PUT") return json({});
      if (call.url.endsWith("/pulls") && call.method === "POST") {
        return json({ number: 9, html_url: "https://github.com/octocat/alpha/pull/9" });
      }
      throw new Error(`unmocked ${call.method} ${call.url}`);
    });

    await client.openSingleFilePr(baseOpts);

    const putContents = calls.find(
      (c) => c.method === "PUT" && c.url.includes("/contents/") && !c.url.includes("?ref="),
    );
    expect(putContents).toBeDefined();
    const body = JSON.parse(putContents!.body!);
    expect(body.sha).toBe("existing-sha-abc123");
    expect(body.message).toBe("ci: update");
  });

  it("treats branch-already-exists (422 on POST /git/refs) as success", async () => {
    captureFetch((call) => {
      if (call.url.includes("/git/ref/heads/")) return json({ object: { sha: "deadbeef" } });
      if (call.url.endsWith("/git/refs") && call.method === "POST") return new Response("already exists", { status: 422 });
      if (/\/contents\/.+\?ref=/.test(call.url) && call.method === "GET") return new Response(null, { status: 404 });
      if (/\/contents\/.+$/.test(call.url) && call.method === "PUT") return json({});
      if (call.url.endsWith("/pulls") && call.method === "POST") {
        return json({ number: 1, html_url: "https://github.com/octocat/alpha/pull/1" });
      }
      throw new Error(`unmocked ${call.method} ${call.url}`);
    });

    const result = await client.openSingleFilePr(baseOpts);
    expect(result.url).toBe("https://github.com/octocat/alpha/pull/1");
  });
});

describe("HttpGitHubClient.putRepoSecret", () => {
  const client = new HttpGitHubClient("test-token");

  it("encrypts the value before PUT — wire body never contains plaintext", async () => {
    const kp = nacl.box.keyPair();
    const pubB64 = btoa(String.fromCharCode(...kp.publicKey));
    const calls = captureFetch((call) => {
      if (call.url.endsWith("/actions/secrets/public-key")) return json({ key_id: "kid-1", key: pubB64 });
      if (/\/actions\/secrets\/[^/]+$/.test(call.url) && call.method === "PUT") return new Response(null, { status: 201 });
      throw new Error(`unmocked ${call.method} ${call.url}`);
    });

    const plaintext = "sk-test-plaintext-secret-value-NEVER-SEEN-ON-WIRE";
    await client.putRepoSecret("octocat", "alpha", "ANTHROPIC_API_KEY", plaintext);

    const putCall = calls.find((c) => c.method === "PUT" && c.url.includes("/actions/secrets/"));
    expect(putCall).toBeDefined();
    expect(putCall!.body).not.toContain(plaintext);
    const body = JSON.parse(putCall!.body!);
    expect(body.encrypted_value).toBeTruthy();
    expect(body.key_id).toBe("kid-1");
  });

  it("returns created=true on 201, created=false on 204", async () => {
    const kp = nacl.box.keyPair();
    const pubB64 = btoa(String.fromCharCode(...kp.publicKey));
    let nextStatus = 201;
    captureFetch((call) => {
      if (call.url.endsWith("/actions/secrets/public-key")) return json({ key_id: "k", key: pubB64 });
      if (/\/actions\/secrets\/[^/]+$/.test(call.url) && call.method === "PUT") return new Response(null, { status: nextStatus });
      throw new Error(`unmocked ${call.method} ${call.url}`);
    });

    nextStatus = 201;
    expect(await client.putRepoSecret("o", "r", "S", "v")).toEqual({ created: true });
    nextStatus = 204;
    expect(await client.putRepoSecret("o", "r", "S", "v")).toEqual({ created: false });
  });
});

describe("HttpGitHubClient.ensureLabel", () => {
  const client = new HttpGitHubClient("test-token");

  it("treats 422 (already exists) as success", async () => {
    captureFetch((call) => {
      if (call.url.endsWith("/labels") && call.method === "POST") return new Response("validation failed", { status: 422 });
      throw new Error(`unmocked ${call.method} ${call.url}`);
    });
    await expect(client.ensureLabel("o", "r", "auto:bug-scan")).resolves.toBeUndefined();
  });
});
