// GET /setup and GET /setup.js handlers.
//
// GitHub redirects to /setup with `?installation_id=<n>&setup_action=install`
// after a user picks repos. The setup page (HTML) is rendered by views/, this
// handler just wraps it in a Response with the right security headers.

import { setupPageHtml } from "../views/setup-page.js";
import { setupScriptJs } from "../views/setup-script.js";

const SETUP_PAGE_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
};

const SETUP_SCRIPT_HEADERS: Record<string, string> = {
  "Content-Type": "application/javascript; charset=utf-8",
  // The setup page is loaded at most once per consumer install — caching
  // buys us nothing but slows down iteration on the form behavior. Always
  // revalidate.
  "Cache-Control": "no-cache",
};

export function renderSetupPage(args: { installationId: string }): Response {
  return new Response(setupPageHtml(args.installationId), { headers: SETUP_PAGE_HEADERS });
}

export function renderSetupScript(): Response {
  return new Response(setupScriptJs(), { headers: SETUP_SCRIPT_HEADERS });
}
