// Hono application factory. Returns an app pre-configured with the supplied
// env, so the entry point (Vercel Edge function under `api/`) can be a thin
// shim that just wires `process.env` into here.
//
// Routes:
//   GET  /            → 302 to GitHub App install URL
//   GET  /setup       → setup form (after install redirect)
//   GET  /setup.js    → tiny script that toggles labels based on profile
//   POST /install     → orchestrator: secret + label + PR per repo
//   POST /webhook     → HMAC-verified ack (no action taken)
//   GET  /health      → liveness probe

import { Hono } from "hono";
import { renderSetupPage, renderSetupScript } from "./handlers/setup.js";
import {
  runInstall,
  renderInstallResults,
  type InstallEnv,
  type InstallFormData,
} from "./handlers/install.js";
import { handleWebhook } from "./handlers/webhook.js";
import type { Provider } from "./profiles.js";

export interface AppEnv extends InstallEnv {
  GITHUB_WEBHOOK_SECRET: string;
  APP_SLUG: string;
}

export function createApp(env: AppEnv): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.text("ok"));

  app.get("/", (c) =>
    c.redirect(`https://github.com/apps/${env.APP_SLUG}/installations/new`, 302),
  );

  app.get("/setup", (c) => {
    const installationId = c.req.query("installation_id");
    if (!installationId) {
      return c.text(
        "Missing installation_id. This page is reached after installing the GitHub App.",
        400,
      );
    }
    return renderSetupPage({ installationId });
  });

  app.get("/setup.js", () => renderSetupScript());

  app.post("/install", async (c) => {
    const form = await c.req.formData();
    const installationIdStr = form.get("installation_id")?.toString() ?? "";
    const installationId = Number.parseInt(installationIdStr, 10);
    if (!Number.isFinite(installationId) || installationId <= 0) {
      return c.text("invalid installation_id", 400);
    }

    const profileId = form.get("profile")?.toString() ?? "";
    const apiKey = form.get("api_key")?.toString() ?? "";
    if (!profileId || !apiKey) {
      return c.text("profile and api_key are required", 400);
    }

    const customProviderRaw = form.get("custom_provider")?.toString();
    const customProvider: Provider | undefined =
      customProviderRaw === "anthropic" || customProviderRaw === "openai"
        ? customProviderRaw
        : undefined;
    const customModel = form.get("custom_model")?.toString() || undefined;
    const enableAutoPr = form.get("enable_auto_pr")?.toString() === "true";

    const data: InstallFormData = {
      installationId,
      profileId,
      apiKey,
      enableAutoPr,
      ...(customProvider ? { customProvider } : {}),
      ...(customModel ? { customModel } : {}),
    };

    try {
      const results = await runInstall(data, env);
      return renderInstallResults(results);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.text(`install failed: ${msg}`, 500);
    }
  });

  app.post("/webhook", (c) => handleWebhook(c.req.raw, env.GITHUB_WEBHOOK_SECRET));

  app.notFound((c) => c.text("not found", 404));

  return app;
}
