# Terms of Service — agent-workflows installer

> **Template.** Replace `[YOUR NAME]`, `[CONTACT EMAIL]`, and `[EFFECTIVE DATE]` before publishing.

**Effective:** [EFFECTIVE DATE]
**Operator:** [YOUR NAME] (`[CONTACT EMAIL]`)

## 1. What you're agreeing to

By installing the agent-workflows GitHub App and submitting the setup form, you agree to these terms. If you don't agree, don't install the App.

## 2. What the service does

The installer service automates a one-time setup task on the GitHub repositories you select: it stores an API key as a GitHub Actions secret, creates a label, and opens a pull request. After that, all further activity happens inside your repositories' own GitHub Actions runs — this service is not in the loop.

The reusable workflow installed into your repository runs Claude Code (Anthropic) or Codex (OpenAI) on a daily cron. That activity is governed by the workflow itself and by the providers' own terms; nothing in those scheduled runs returns to this service.

## 3. What you're responsible for

- The API key you paste belongs to you and is billed to you. You're responsible for staying under your provider's quotas and for the cost of the agent's usage.
- The repositories you select must be ones you have authority to install GitHub Apps on.
- You are responsible for reviewing, merging (or rejecting) the install pull request, and for monitoring the workflow's runs after install.

## 4. What we don't promise

This service is provided **"as is" and without warranty of any kind**, express or implied. We don't promise:

- Uptime or availability
- That the agent will find every bug, or that the bugs it finds are correct
- That the workflow won't open occasional incorrect or noisy PRs/issues
- That third-party APIs (GitHub, Anthropic, OpenAI) will continue to behave as they do today

## 5. Limitation of liability

To the maximum extent permitted by law, the operator's total liability for any claim arising out of or relating to this service is limited to **zero** — the service is free.

In no event will the operator be liable for any indirect, incidental, consequential, or special damages, including lost profits, lost data, or business interruption, even if advised of the possibility of such damages.

## 6. Termination

You may stop using this service at any time by uninstalling the GitHub App. We may stop offering this service at any time, with or without notice; the App will continue to work in any repository it has already been installed into until you uninstall it.

## 7. Changes

We may update these terms. Material changes will bump the **Effective** date above. Continued use after that date constitutes acceptance.

## 8. Contact

[CONTACT EMAIL]
