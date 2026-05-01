# Privacy Policy — agent-workflows installer

> **Template.** Replace `[YOUR NAME]`, `[CONTACT EMAIL]`, and `[EFFECTIVE DATE]` before publishing. If you list this on GitHub Marketplace, this page must be reachable at a stable URL.

**Effective:** [EFFECTIVE DATE]
**Operator:** [YOUR NAME] (`[CONTACT EMAIL]`)

## What this service does

The agent-workflows GitHub App helps you install a daily bug-scan workflow into GitHub repositories. After you install the App on selected repositories, GitHub redirects you to a setup page hosted by this service. The setup page asks you to pick an agent profile and paste an API key (Anthropic or OpenAI). When you submit the form, this service:

1. Encrypts your API key with the destination repository's GitHub-issued public key (libsodium sealed_box) and PUTs it as a GitHub Actions secret on that repository.
2. Creates the `auto:bug-scan` label on the repository.
3. Opens a pull request adding `.github/workflows/daily-scan.yml` to the repository.

## What data we hold, and for how long

| Data | Where it lives | How long |
|---|---|---|
| Your API key (Anthropic / OpenAI) | In Edge function memory for one HTTP request, then forwarded to the GitHub Actions Secrets API | Discarded at request end. **Not persisted, not logged, not transmitted anywhere except GitHub.** |
| GitHub App installation ID | Passed through the URL during the setup flow | Not persisted. |
| Your GitHub installation access token | Minted on demand for one HTTP request | Discarded at request end. |
| Request-level operational logs (status code, path, timing) | Vercel function logs | Per Vercel's retention policy (currently ~24 hours on Hobby, longer on Pro). API keys, secret values, and PEM contents are explicitly stripped from logs. |

**We do not store your API key.** Once it has been forwarded to GitHub's encrypted Secrets API, it lives only inside GitHub's infrastructure, accessible only to the GitHub Actions runner during workflow execution, and only on the repositories you selected.

## What we do not collect

- We do not collect or display your repository contents.
- We do not collect or persist your name, email, or GitHub username.
- We do not use cookies, analytics scripts, or third-party trackers.

## Third parties

This service interacts only with GitHub (`api.github.com`) on your behalf. The reusable workflow it installs into your repositories will, when run, also send requests to:

- Anthropic API (`api.anthropic.com`) — if you picked an `anthropic` agent profile
- OpenAI API (`api.openai.com`) — if you picked an `openai` agent profile

Both calls are made directly from your repository's GitHub Actions runner, not from this service.

## Your rights

- **Revoke at any time**: uninstall the GitHub App from your repositories at `https://github.com/settings/installations`. The repository secrets we set will remain until you delete them in your repo's settings.
- **Rotate keys**: rotate your Anthropic/OpenAI key at the provider's dashboard at any time. Re-run the install flow with the new key, or update the secret directly in your repository's settings.
- **Inquiries**: contact [CONTACT EMAIL] for any data-handling question.

## Changes to this policy

If we change this policy materially, we'll bump the **Effective** date above. Continued use of the installer after that date constitutes acceptance.

## Source

The full source of the installer service is open at <https://github.com/Fralleee/agent-workflows>. You can audit the data-handling code paths in `installer/src/`.
