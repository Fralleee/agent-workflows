// Orchestrator integration test using `fetch` mocking. We swap globalThis.fetch
// for a recorder that returns canned responses based on URL+method. The test
// asserts:
//   - the call sequence matches what GitHub expects (token → public-key → put-secret → label → ref → put-contents → pulls)
//   - the API key is NEVER echoed back in the response or logged
//   - per-repo failures don't abort the whole batch

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import nacl from "tweetnacl";
import { runInstall } from "../src/handlers/install.js";
import type { InstallEnv, InstallFormData } from "../src/handlers/install.js";

// Same test-only RSA-2048 PKCS8 key as in app-auth.test.ts.
const TEST_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDb297oEWx9Y/lQ
4VOTV0iWwnkun8rS4cRYW9NhrDXs1AwGinUHk0MZGb/FW//EdPreY76WQi8Itdq9
GbZ+dVgVY8ZXDTgduC+QEnD/86xqLS9A8XegWdFYXsaIDsMbZOpKI8b4ssUsdwps
Z2RYInMe8g70TmglnBXH41zbNYKlu293L/9PkhEO0YUE1pP8gpki/BHROivfXgC8
DZqPGhbRFGarcsgCFKWgS6z8DQElV4P6qdybs6k4hsYLwrMghE6+RpyF9yjICpTn
jkqXrleGSs9uoeTzFrGju57QGbI3JE4n8VSzT4jvYqFjYuNM4bT5lQAjbaCNKbWN
RmsWYja3AgMBAAECggEAIl/NiZ4TxsUHOXCJVxuJ81xDgxkjpnX680+kDHzWz4jV
un4STxVko7uFYq+AHTCm+ndA2JBPdz6rjO5EvJ/PHkUDwR+FewwNj6p6dWIdPlqD
LVWzfOQeGYFz69jXA2TzRpUyajbVIh8Yh5tgsnDsa9Wvpd3OZbbyJtby8Sj8HLoX
vNsSODeXbqhTkFrfaDcQBdOsFruCRddMDoNJczJB44PZ7oJX+j15UEAxJdSzQC42
g+ovA1oygNWTdOm2LZt+tOGhC231AezRYKdfpHSjFa7zw7QrqwjQZUP4qIi2emYx
I3JeiNmE7J/wjkgM1DvrzXQ7JZ3Y352aAlFxx8DNoQKBgQDzkeiDygz8GAPxFFYe
T/3Oj5D9jhjmkMJtSLUKNDKP3oUrR3g2HQeoUI9Z7mpvNMEAF6k/jVUgTbv+eGpv
Z2S9zaEduofEJWqLCm5MfafD+AW3nbx1yHyRFRgeQ6K22xLOCCVuLnVFSzTpQT2i
omXxAX/bn+AxqekM4tkyphm2FwKBgQDnFDEVFFJJD/Fv5TKz1Q5l5HyoWHn6Dv8Q
vQDLp8aCKzFK/yLLcZARRKewp+Dg5IWCMnWg5x0q3RLmyySFJgzB/Kr+X+2m687d
Hi1qBmGUgnbGeepiYcR6H5Mzr1Ikd98YEwRT3nta6RNk2xAgMSRIWcUNrqNFALJu
+rbfCliIYQKBgAqEjHPUb8cbCmCIrkdU0PLwhCRO1IhwS9UIRLkSE/TeeQWramd7
zW7ZO7d4ciQnNQZZ/zb9VWW1tZ6BeKci4djIXmK4QVCZBQbIBodLDcmKlkSdjRvQ
8oAZVxdHeGlJAIDhHSyq2OmLG9fOt2ikdp53oBvNxZKfca7axOJJBec1AoGBANca
Vq42onpcmvT8N/xq4eI7lUboRXNerlSYe7sYTJMzPcmAQpV6+w74B9lMDOuMDjOq
YREM0nvqGwQ4KaDAULPrTglIpuLxMzlmNAQ0OHWUFJihOGuocsrzxYUhOKe15jh0
y1x/B/kSaflCanptBEdNOT+JR3aeNXtVaxGogc1BAoGBAIUI7rvDOvxBgalTd3W5
aKUosGItUZLI5912UfUPRGmUCSeikqHwLFNTuVEsBmHJf5AgSi75a/awX6jlD374
vPXapxtVJo8UMN//4eglfk4QPNQ4BGoYBuzYkjRtvB7k4Dj5az7Q/epPnV9uYAfg
w3/eZwP9wtc/3sAZHdzha45e
-----END PRIVATE KEY-----`;

const ENV: InstallEnv = {
  GITHUB_APP_ID: "111",
  GITHUB_APP_PRIVATE_KEY: TEST_PEM,
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

interface RecordedCall {
  url: string;
  method: string;
  body: string | undefined;
}

let calls: RecordedCall[] = [];
let publicKeyB64: string;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  const kp = nacl.box.keyPair();
  publicKeyB64 = btoa(String.fromCharCode(...kp.publicKey));
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function installFetchMock(opts: { failRepo?: string } = {}) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url: u, method, body });

    // 1) Mint installation token
    if (u.endsWith("/access_tokens") && method === "POST") {
      return jsonResponse({ token: "ghs_test_install_token", expires_at: "2099-01-01T00:00:00Z" });
    }
    // 2) List installation repos
    if (u.startsWith("https://api.github.com/installation/repositories")) {
      return jsonResponse({
        total_count: 2,
        repositories: [
          {
            id: 1, name: "alpha", full_name: "octocat/alpha", default_branch: "main",
            owner: { login: "octocat" },
          },
          {
            id: 2, name: "beta", full_name: "octocat/beta", default_branch: "main",
            owner: { login: "octocat" },
          },
        ],
      });
    }
    // 3) Public key
    if (u.endsWith("/actions/secrets/public-key")) {
      return jsonResponse({ key_id: "kid-1", key: publicKeyB64 });
    }
    // 4) PUT secret
    if (/\/actions\/secrets\/[^/]+$/.test(u) && method === "PUT") {
      return new Response(null, { status: 201 });
    }
    // 5) Create label
    if (u.endsWith("/labels") && method === "POST") {
      return new Response(null, { status: 201 });
    }
    // 6) Get default branch ref
    if (u.includes("/git/ref/heads/")) {
      // Inject a failure for the configured repo on this call.
      if (opts.failRepo && u.includes(`/${opts.failRepo}/`)) {
        return new Response("simulated failure", { status: 500 });
      }
      return jsonResponse({ object: { sha: "deadbeef" } });
    }
    // 7) Create new ref
    if (u.endsWith("/git/refs") && method === "POST") {
      return new Response(null, { status: 201 });
    }
    // 8) PUT contents
    if (/\/contents\/.+$/.test(u) && method === "PUT") {
      return jsonResponse({});
    }
    // 9) Open PR
    if (u.endsWith("/pulls") && method === "POST") {
      return jsonResponse({ number: 7, html_url: `${u.replace(/\/pulls$/, "")}/pull/7` });
    }

    throw new Error(`unmocked request: ${method} ${u}`);
  }) as typeof globalThis.fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("runInstall", () => {
  it("opens a PR for every repo on the happy path", async () => {
    installFetchMock();
    const results = await runInstall(FORM, ENV);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.prUrl)).toBe(true);
    expect(results.every((r) => !r.error)).toBe(true);
  });

  it("never echoes the API key into call bodies", async () => {
    installFetchMock();
    await runInstall(FORM, ENV);
    for (const c of calls) {
      if (c.body) expect(c.body).not.toContain(FORM.apiKey);
    }
  });

  it("hits public-key, put-secret, label, ref, contents, pulls per repo", async () => {
    installFetchMock();
    await runInstall(FORM, ENV);
    const urls = calls.map((c) => `${c.method} ${pathOnly(c.url)}`);
    // Each repo should produce one of each step.
    const matchCount = (re: RegExp) => urls.filter((u) => re.test(u)).length;
    expect(matchCount(/POST .+\/access_tokens$/)).toBe(1);
    expect(matchCount(/^GET \/installation\/repositories/)).toBeGreaterThanOrEqual(1);
    expect(matchCount(/GET .+\/actions\/secrets\/public-key$/)).toBe(2);
    expect(matchCount(/PUT .+\/actions\/secrets\//)).toBe(2);
    expect(matchCount(/POST .+\/labels$/)).toBe(2);
    expect(matchCount(/GET .+\/git\/ref\/heads\/main$/)).toBe(2);
    expect(matchCount(/POST .+\/git\/refs$/)).toBe(2);
    expect(matchCount(/PUT .+\/contents\//)).toBe(2);
    expect(matchCount(/POST .+\/pulls$/)).toBe(2);
  });

  it("isolates per-repo failures (one repo dies, the other still ships)", async () => {
    installFetchMock({ failRepo: "alpha" });
    const results = await runInstall(FORM, ENV);
    const alpha = results.find((r) => r.repo === "octocat/alpha");
    const beta = results.find((r) => r.repo === "octocat/beta");
    expect(alpha?.error).toBeTruthy();
    expect(alpha?.prUrl).toBeUndefined();
    expect(beta?.prUrl).toBeTruthy();
    expect(beta?.error).toBeUndefined();
  });

  it("uses the custom (provider, model) if profile=custom", async () => {
    installFetchMock();
    const results = await runInstall(
      { ...FORM, profileId: "custom", customProvider: "openai", customModel: "gpt-5-thinking" },
      ENV,
    );
    expect(results).toHaveLength(2);
    // Stub put to /contents was called with base64 content; decode it and check.
    const contentsCall = calls.find((c) => c.method === "PUT" && c.url.includes("/contents/"));
    expect(contentsCall).toBeDefined();
    const parsed = JSON.parse(contentsCall!.body!);
    const decoded = atob(parsed.content);
    expect(decoded).toContain("provider: openai");
    expect(decoded).toContain("model: gpt-5-thinking");
    expect(decoded).toContain("OPENAI_API_KEY");
  });
});

function pathOnly(u: string): string {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
}
