import { describe, expect, it } from "bun:test";
import { installResultPageHtml } from "../src/views/install-result-page.js";

describe("installResultPageHtml", () => {
  it("lists PR URLs for successful repos under 'PR opened'", () => {
    const html = installResultPageHtml([
      { repo: "octocat/alpha", prUrl: "https://github.com/octocat/alpha/pull/7" },
      { repo: "octocat/beta", prUrl: "https://github.com/octocat/beta/pull/9" },
    ]);
    expect(html).toContain("PR opened (2)");
    expect(html).toContain("https://github.com/octocat/alpha/pull/7");
    expect(html).toContain("https://github.com/octocat/beta/pull/9");
    expect(html).not.toContain("Failed");
  });

  it("lists error messages for failed repos under 'Failed'", () => {
    const html = installResultPageHtml([
      { repo: "octocat/alpha", error: "ensure label failed: 403 Forbidden" },
    ]);
    expect(html).toContain("Failed (1)");
    expect(html).toContain("ensure label failed: 403 Forbidden");
    expect(html).toContain("re-visit the install URL to retry");
    expect(html).not.toContain("PR opened");
  });

  it("shows the empty-state message when no repos were attached", () => {
    const html = installResultPageHtml([]);
    expect(html).toContain("No repos were attached to this install");
    expect(html).not.toContain("PR opened");
    expect(html).not.toContain("Failed");
  });

  it("escapes repo names and error messages", () => {
    const html = installResultPageHtml([
      { repo: '<img src=x onerror="alert(1)">', error: '"oops" & <bad>' },
    ]);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('"oops" &');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&quot;oops&quot; &amp; &lt;bad&gt;");
  });

  it("renders both successes and failures in the same response", () => {
    const html = installResultPageHtml([
      { repo: "octocat/alpha", prUrl: "https://github.com/octocat/alpha/pull/7" },
      { repo: "octocat/beta", error: "put contents failed: 403" },
    ]);
    expect(html).toContain("PR opened (1)");
    expect(html).toContain("Failed (1)");
  });
});
