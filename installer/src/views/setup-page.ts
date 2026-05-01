// Setup form HTML — pure function of installationId. Imports the agent
// profile catalog so each profile renders as a card. The handler in
// handlers/setup.ts wraps this string in a Response with security headers.

import { PROFILES } from "../profiles.js";
import { escapeHtml } from "./html.js";

export function setupPageHtml(installationId: string): string {
  const safeId = escapeHtml(installationId);

  const profileCards = PROFILES.map((p, i) => {
    const checked = i === 0 ? " checked" : "";
    const recommendedBadge = p.recommended
      ? `<span class="card-pill card-pill-recommended">Recommended</span>`
      : "";
    const providerBadge = `<span class="card-pill card-pill-${p.provider}">${p.provider === "anthropic" ? "Anthropic" : "OpenAI"}</span>`;
    return `
        <label class="profile-card">
          <input type="radio" name="profile" value="${escapeHtml(p.id)}" data-provider="${escapeHtml(p.provider)}" data-help="${escapeHtml(p.apiKeyHelpUrl)}"${checked}>
          <span class="card-body">
            <span class="card-pills">${providerBadge}${recommendedBadge}</span>
            <span class="card-title">${escapeHtml(p.label)}</span>
            <span class="card-desc">${escapeHtml(p.description)}</span>
          </span>
          <span class="card-check" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </label>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Install agent-workflows</title>
  <style>
    :root {
      --bg: #f7f7f8;
      --bg-card: #ffffff;
      --bg-input: #ffffff;
      --bg-input-focus: #ffffff;
      --bg-subtle: #f0f0f2;
      --border: #d8d8de;
      --border-strong: #b8b8c0;
      --border-focus: #3a7afe;
      --text: #18181b;
      --text-muted: #6b6b75;
      --text-faint: #9a9aa3;
      --primary: #3a7afe;
      --primary-hover: #2c64d8;
      --primary-fg: #ffffff;
      --accent-anthropic: #c8602a;
      --accent-anthropic-bg: #fbe9d8;
      --accent-openai: #10a37f;
      --accent-openai-bg: #d6f4e8;
      --accent-recommended: #b08600;
      --accent-recommended-bg: #fff3c4;
      --shadow-card: 0 1px 2px rgba(0,0,0,.04), 0 0 0 1px rgba(0,0,0,.04);
      --shadow-input-focus: 0 0 0 3px rgba(58,122,254,.18);
      --radius: 8px;
      --radius-card: 12px;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f1014;
        --bg-card: #18191f;
        --bg-input: #1d1e25;
        --bg-input-focus: #232430;
        --bg-subtle: #1a1b21;
        --border: #2c2d36;
        --border-strong: #3d3e48;
        --border-focus: #6395ff;
        --text: #f1f1f4;
        --text-muted: #a4a5af;
        --text-faint: #6c6d77;
        --primary: #4d8aff;
        --primary-hover: #6c9eff;
        --primary-fg: #ffffff;
        --accent-anthropic: #f0a06a;
        --accent-anthropic-bg: #3d2818;
        --accent-openai: #4ed3ad;
        --accent-openai-bg: #173529;
        --accent-recommended: #f0c850;
        --accent-recommended-bg: #3a2f10;
        --shadow-card: 0 1px 2px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.04);
        --shadow-input-focus: 0 0 0 3px rgba(99,149,255,.22);
      }
    }

    * { box-sizing: border-box; }

    html, body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "Helvetica Neue", system-ui, sans-serif;
      font-size: 15px;
      line-height: 1.5;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }

    main {
      max-width: 680px;
      margin: 0 auto;
      padding: 3rem 1.25rem 4rem;
    }

    .header {
      margin-bottom: 2rem;
    }
    .header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0 0 0.4rem;
      letter-spacing: -0.01em;
    }
    .header p {
      margin: 0;
      color: var(--text-muted);
      font-size: 1rem;
    }

    .section {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      padding: 1.25rem 1.4rem 1.4rem;
      margin-bottom: 1rem;
      box-shadow: var(--shadow-card);
    }
    .section-header {
      display: flex;
      align-items: baseline;
      gap: 0.6rem;
      margin-bottom: 0.9rem;
    }
    .section-num {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-faint);
    }
    .section-title {
      font-size: 1rem;
      font-weight: 600;
      margin: 0;
    }
    .section-hint {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin: 0 0 1rem;
    }

    /* Profile cards */
    .profile-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.55rem;
    }
    @media (min-width: 540px) {
      .profile-grid { grid-template-columns: 1fr 1fr; }
    }
    .profile-card {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.85rem 1rem;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      cursor: pointer;
      transition: border-color .12s ease, background .12s ease, box-shadow .12s ease;
    }
    .profile-card:hover {
      border-color: var(--border-strong);
    }
    .profile-card input[type=radio] {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .profile-card input[type=radio]:focus-visible + .card-body {
      outline: 2px solid var(--border-focus);
      outline-offset: 4px;
      border-radius: 4px;
    }
    .profile-card:has(input:checked) {
      border-color: var(--primary);
      box-shadow: var(--shadow-input-focus);
      background: var(--bg-input-focus);
    }
    .card-body {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      min-width: 0;
    }
    .card-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      margin-bottom: 0.1rem;
    }
    .card-pill {
      display: inline-block;
      font-size: 0.66rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      line-height: 1.4;
    }
    .card-pill-anthropic { color: var(--accent-anthropic); background: var(--accent-anthropic-bg); }
    .card-pill-openai    { color: var(--accent-openai);    background: var(--accent-openai-bg); }
    .card-pill-recommended { color: var(--accent-recommended); background: var(--accent-recommended-bg); }
    .card-title {
      font-weight: 600;
      font-size: 0.95rem;
    }
    .card-desc {
      color: var(--text-muted);
      font-size: 0.82rem;
      line-height: 1.4;
    }
    .card-check {
      flex: 0 0 auto;
      width: 22px;
      height: 22px;
      border: 1.5px solid var(--border-strong);
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: transparent;
      transition: all .12s ease;
      align-self: center;
    }
    .profile-card:has(input:checked) .card-check {
      background: var(--primary);
      border-color: var(--primary);
      color: var(--primary-fg);
    }

    /* Custom fields (revealed when custom selected) */
    .custom-toggle {
      display: block;
      margin-top: 0.85rem;
    }
    .custom-toggle summary {
      cursor: pointer;
      color: var(--text-muted);
      font-size: 0.85rem;
      list-style: none;
      user-select: none;
      padding: 0.2rem 0;
    }
    .custom-toggle summary::-webkit-details-marker { display: none; }
    .custom-toggle summary::before {
      content: "▸";
      display: inline-block;
      margin-right: 0.45rem;
      transition: transform .15s ease;
      color: var(--text-faint);
    }
    .custom-toggle[open] summary::before { transform: rotate(90deg); }
    .custom-fields {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 0.6rem;
      margin-top: 0.7rem;
      padding: 0.85rem;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .custom-fields label {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .custom-fields label > select,
    .custom-fields label > input {
      flex: 1 1 auto;
    }

    /* Inputs */
    label.field-label {
      display: block;
      font-weight: 600;
      font-size: 0.9rem;
      margin-bottom: 0.4rem;
    }
    input[type=text],
    input[type=password],
    select {
      width: 100%;
      padding: 0.55rem 0.7rem;
      background: var(--bg-input);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font: inherit;
      transition: border-color .12s ease, box-shadow .12s ease, background .12s ease;
    }
    input[type=text]:focus,
    input[type=password]:focus,
    select:focus {
      outline: none;
      border-color: var(--border-focus);
      box-shadow: var(--shadow-input-focus);
      background: var(--bg-input-focus);
    }
    input::placeholder { color: var(--text-faint); }

    /* API key input with show/hide toggle */
    .key-wrap { position: relative; }
    .key-wrap input { padding-right: 4.6rem; font-family: ui-monospace, SFMono-Regular, "Menlo", monospace; font-size: 0.92rem; }
    .key-toggle {
      position: absolute;
      right: 0.4rem;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: 0;
      color: var(--text-muted);
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      padding: 0.35rem 0.55rem;
      border-radius: 4px;
      cursor: pointer;
    }
    .key-toggle:hover { color: var(--text); background: var(--bg-subtle); }

    .help {
      margin: 0.5rem 0 0;
      font-size: 0.82rem;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .help a { color: var(--primary); text-decoration: none; }
    .help a:hover { text-decoration: underline; }

    /* Auto-PR option */
    .checkbox-row {
      display: flex;
      align-items: flex-start;
      gap: 0.7rem;
      cursor: pointer;
      padding: 0.4rem 0;
    }
    .checkbox-row input[type=checkbox] {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      margin: 0.2rem 0 0;
      accent-color: var(--primary);
      cursor: pointer;
    }
    .checkbox-row .row-text { flex: 1 1 auto; }
    .checkbox-row .row-title { font-weight: 600; font-size: 0.9rem; }
    .checkbox-row .row-sub { color: var(--text-muted); font-size: 0.82rem; margin-top: 0.15rem; line-height: 1.45; }

    /* Submit */
    .actions {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-top: 0.6rem;
    }
    button[type=submit] {
      background: var(--primary);
      color: var(--primary-fg);
      border: 0;
      padding: 0.75rem 1rem;
      border-radius: var(--radius);
      font: inherit;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background .12s ease, transform .12s ease;
    }
    button[type=submit]:hover { background: var(--primary-hover); }
    button[type=submit]:focus-visible {
      outline: none;
      box-shadow: var(--shadow-input-focus);
    }
    button[type=submit]:disabled {
      cursor: progress;
      opacity: 0.85;
    }
    .spinner {
      display: inline-block;
      width: 0.85em;
      height: 0.85em;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-right: 0.5em;
      vertical-align: -0.1em;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .privacy {
      color: var(--text-muted);
      font-size: 0.8rem;
      line-height: 1.5;
      margin: 0;
    }
    .privacy a { color: var(--text-muted); text-decoration: underline; text-decoration-color: var(--text-faint); }
    .privacy a:hover { color: var(--text); }

    /* Visually-hidden decoy fields that absorb Chrome's autofill heuristic.
       Chrome looks for a username/email input near a password field; if it
       finds one, it dumps saved data into it. Giving it these traps means the
       real fields stay clean. They're aria-hidden and untabbable, so screen
       readers and keyboard users skip them. */
    .autofill-trap {
      position: absolute !important;
      left: -10000px !important;
      top: -10000px !important;
      width: 1px !important;
      height: 1px !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  </style>
</head>
<body>
  <main>
    <header class="header">
      <h1>Install agent-workflows</h1>
      <p>Daily AI bug-scanning across the repos you just selected.</p>
    </header>

    <form method="POST" action="/install" id="install-form" autocomplete="off">
      <input type="hidden" name="installation_id" value="${safeId}">
      <!-- Autofill traps; see .autofill-trap rule above. -->
      <input class="autofill-trap" type="text" name="_trap_username" autocomplete="username" tabindex="-1" aria-hidden="true">
      <input class="autofill-trap" type="email" name="_trap_email" autocomplete="email" tabindex="-1" aria-hidden="true">
      <input class="autofill-trap" type="password" name="_trap_password" autocomplete="current-password" tabindex="-1" aria-hidden="true">

      <section class="section">
        <div class="section-header">
          <span class="section-num">Step 1</span>
          <h2 class="section-title">Pick an agent</h2>
        </div>
        <p class="section-hint">You're billed by the chosen provider for the agent's daily activity.</p>
        <div class="profile-grid" role="radiogroup" aria-label="Agent profile">${profileCards}
        </div>
        <details class="custom-toggle" id="custom-toggle">
          <summary>Use a custom provider/model instead</summary>
          <div class="custom-fields">
            <label>
              Provider
              <select id="custom_provider" name="custom_provider">
                <option value="anthropic">anthropic</option>
                <option value="openai">openai</option>
              </select>
            </label>
            <label>
              Model id
              <input id="custom_model" name="custom_model" type="text" placeholder="e.g. claude-opus-4-7" autocomplete="off">
            </label>
          </div>
        </details>
      </section>

      <section class="section">
        <div class="section-header">
          <span class="section-num">Step 2</span>
          <h2 class="section-title">API key</h2>
        </div>
        <label class="field-label" for="api_key" id="api_key_label">Anthropic API key</label>
        <div class="key-wrap">
          <input id="api_key" name="api_key" type="password" required spellcheck="false" autocomplete="off" placeholder="sk-ant-…">
          <button type="button" class="key-toggle" id="api_key_toggle" aria-label="Show API key">Show</button>
        </div>
        <p class="help" id="api_key_help">Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" id="api_key_help_link">console.anthropic.com</a>. Stored as a GitHub Actions secret on each selected repo and never persisted by this installer.</p>
      </section>

      <section class="section">
        <div class="section-header">
          <span class="section-num">Step 3</span>
          <h2 class="section-title">Options</h2>
        </div>
        <label class="checkbox-row">
          <input id="enable_auto_pr" name="enable_auto_pr" type="checkbox" value="true">
          <span class="row-text">
            <span class="row-title">Enable auto-PRs</span>
            <span class="row-sub">The agent may open draft PRs to fix issues, gated on validation passing. Leave off for the first few weeks; flip on after the issues look good.</span>
          </span>
        </label>
      </section>

      <div class="actions">
        <button type="submit" id="submit-btn">Install on selected repos</button>
        <p class="privacy">Your API key transits this service for one HTTP request and is then discarded. Source on <a href="https://github.com/Fralleee/agent-workflows" target="_blank" rel="noopener">github.com/Fralleee/agent-workflows</a> — auditable.</p>
      </div>
    </form>
  </main>

  <script src="/setup.js"></script>
</body>
</html>`;
}
