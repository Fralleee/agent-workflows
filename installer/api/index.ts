// Vercel Edge entry point. All request paths funnel here via the rewrite in
// `vercel.json`; Hono inspects `request.url` (which Vercel preserves) and
// dispatches to the right handler.

import { handle } from "hono/vercel";
import { createApp } from "../src/app.js";

export const runtime = "edge";

const requireEnv = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
};

const app = createApp({
  GITHUB_APP_ID: requireEnv("GITHUB_APP_ID"),
  GITHUB_APP_PRIVATE_KEY: requireEnv("GITHUB_APP_PRIVATE_KEY"),
  GITHUB_WEBHOOK_SECRET: requireEnv("GITHUB_WEBHOOK_SECRET"),
  HUB_REPO: process.env["HUB_REPO"] ?? "Fralleee/agent-workflows",
  HUB_REF: process.env["HUB_REF"] ?? "v1",
  LABEL: process.env["LABEL"] ?? "auto:bug-scan",
  APP_SLUG: process.env["APP_SLUG"] ?? "agent-workflows",
});

export const GET = handle(app);
export const POST = handle(app);
