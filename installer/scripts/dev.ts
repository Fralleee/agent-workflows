// Standalone Bun dev server for visual review of the setup form.
//
// Run with:    bun run dev:preview
// Then open:   http://localhost:3000/setup?installation_id=12345
//
// What works:
//   GET /              redirects to the GitHub install page
//   GET /setup         renders the form (this is the one you came here for)
//   GET /setup.js      toggles the API-key label/help reactively
//   GET /health        returns "ok"
//
// What deliberately doesn't work:
//   POST /install      will fail when it tries to mint a JWT with the fake
//                      private key — useful for previewing the error page.
//   POST /webhook      HMAC will reject every request the test secret didn't
//                      sign — same.
//
// For end-to-end testing against a real GitHub App + real env, use
// `bun run dev` (which invokes `vercel dev`) — see ../docs/deployment.md.

import { createApp } from "../src/app.js";

const app = createApp({
  GITHUB_APP_ID: "0",
  GITHUB_APP_PRIVATE_KEY: "fake-pem-not-for-real-use",
  GITHUB_WEBHOOK_SECRET: "fake-webhook-secret-not-for-real-use",
  HUB_REPO: process.env["HUB_REPO"] ?? "Fralleee/agent-workflows",
  HUB_REF: process.env["HUB_REF"] ?? "v1",
  LABEL: process.env["LABEL"] ?? "auto:bug-scan",
  APP_SLUG: process.env["APP_SLUG"] ?? "agent-workflows",
});

function startServer(startPort: number, attempts = 10): ReturnType<typeof Bun.serve> {
  for (let p = startPort; p < startPort + attempts; p++) {
    try {
      return Bun.serve({ port: p, fetch: app.fetch });
    } catch (e) {
      if ((e as { code?: string }).code !== "EADDRINUSE") throw e;
      console.log(`port ${p} in use, trying ${p + 1}…`);
    }
  }
  throw new Error(
    `no free port in [${startPort}, ${startPort + attempts}). Set PORT=<n> to override.`,
  );
}

const server = startServer(Number(process.env["PORT"] ?? 3000));

console.log(`agent-workflows installer (preview) running at ${server.url}`);
console.log(`  → setup form:    ${server.url}setup?installation_id=12345`);
console.log(`  → install URL:   ${server.url}            (302 to github.com)`);
console.log(`  → health check:  ${server.url}health`);
console.log("");
console.log("Press Ctrl+C to stop.");
