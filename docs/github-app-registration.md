# Registering the GitHub App

This is the one part of the install that has to happen in a browser, by you, the maintainer. It's a one-time thing per environment (dev / prod).

## 1. Create the App

Go to one of:

- **Personal**: <https://github.com/settings/apps/new>
- **Organization**: `https://github.com/organizations/<ORG>/settings/apps/new`

Fill in:

| Field | Value |
|---|---|
| **GitHub App name** | `agent-workflows` (or your preferred slug — must be unique on github.com) |
| **Homepage URL** | `https://github.com/Fralleee/agent-workflows` |
| **Callback URL** | `https://<your-vercel-url>/setup` (you can fill this in after deploying — leave blank for now) |
| **Setup URL (optional)** | Same as Callback URL: `https://<your-vercel-url>/setup` |
| **Redirect on update** | ☑ Check `Redirect on update` so users adding repos to an existing install land on the setup page again |
| **Webhook URL** | `https://<your-vercel-url>/webhook` |
| **Webhook secret** | Generate a random string (`openssl rand -hex 32`); save it — you'll paste it into Vercel env vars too |
| **Webhook active** | ☑ Active |

## 2. Permissions

Under **Repository permissions**:

| Permission | Access | Why |
|---|---|---|
| `Actions` | Read & write | Set the `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` repository secret |
| `Contents` | Read & write | Create the install branch and commit the workflow file |
| `Issues` | Read & write | Create the `auto:bug-scan` label |
| `Metadata` | Read | Required by every App; auto-checked |
| `Pull requests` | Read & write | Open the install PR |

Leave **Organization permissions** and **Account permissions** unset.

## 3. Subscribe to events

Under **Subscribe to events**, check:

- `Installation` — fires when a user installs/uninstalls
- `Installation repositories` — fires when a user adds/removes repos from an existing install

That's it. The Edge function doesn't act on these today (the install flow is synchronous via `/setup`), but the App requires the webhook URL to be live.

## 4. Where can this app be installed?

- **Phase 1 (recommended)**: `Only on this account` — keeps the App private to you while you iterate.
- **Phase 2 (later)**: `Any account` — lets anyone install. Don't do this until you're ready for public traffic and have the privacy policy + ToS pages live.

## 5. Generate a private key

After clicking **Create GitHub App**, scroll to **Private keys** at the bottom of the App's settings page and click **Generate a private key**. A `.pem` file downloads. Treat it like a credential — there's no way to retrieve it again, only re-issue.

You'll paste this PEM into the Vercel env vars in [`docs/deployment.md`](deployment.md).

## 6. Note the App ID and slug

At the top of the App's settings page:

- **App ID** — a 6–7 digit number. Copy it.
- **App slug** — the URL-safe name (e.g. `agent-workflows`). Set as the `APP_SLUG` env var on your Vercel project (defaults to `agent-workflows` if you don't set it).

## 7. Public install URL

Once the App is registered, anyone you give this URL to can install:

```
https://github.com/apps/<APP_SLUG>/installations/new
```

Or, since the Edge function's `GET /` redirects to that URL:

```
https://<your-vercel-url>/
```

That's the link you put in the project README's "Install" section.
