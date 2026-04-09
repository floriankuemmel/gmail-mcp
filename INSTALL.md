# Installation

Step-by-step setup for the Gmail MCP Server. One-time effort — after this, the server just runs.

## Prerequisites

- **macOS** or **Linux** (everything except `open_in_apple_mail` is cross-platform)
- **Node.js 18+** — [download](https://nodejs.org/) or `brew install node`
- **A Google account** with access to [Google Cloud Console](https://console.cloud.google.com)

## Step 1 — Install dependencies

The convention used throughout this guide is to put the server under
`~/MCP/gmail-mcp/`. That's just where I keep my MCP servers — the location
is arbitrary. If you'd rather put it somewhere else (`~/Code/`, `~/Tools/`,
your Documents folder…), do so and adjust the paths in Step 4 accordingly.
You can also ask Claude Code to move it later — nothing else is hard-coded.

```bash
mkdir -p ~/MCP
cd ~/MCP
# unzip the distribution here so ~/MCP/gmail-mcp/ exists
cd gmail-mcp
npm install
```

> **Required.** `node_modules/` is intentionally not shipped in the zip. Without `npm install`, the server will not start.

## Step 2 — Google Cloud project

This is the only part with more than a couple of clicks. Once done, never again.

### 2.1 — Create the project
1. Open [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Create or select project** in the top bar
   ![Create or select project](docs/screenshots/2.1-welcome-empty.png)
3. In the dialog click **"New Project"**
   ![New project button](docs/screenshots/2.1-new-project-button.png)
4. Name it, e.g., `gmail-mcp-private` — leave Organization as "No organization" — **Create**
   ![New project form](docs/screenshots/2.1-new-project-form.png)
5. Select the new project in the top bar
   ![Project created](docs/screenshots/2.1-project-created.png)

### 2.2 — Enable the Gmail API
1. Left sidebar → **APIs & Services → Library**
   ![Sidebar Library](docs/screenshots/2.2-sidebar-library.png)
2. Search for `gmail` → click **Gmail API**
   ![Search Gmail](docs/screenshots/2.2-search-gmail.png)
   ![Gmail API result](docs/screenshots/2.2-gmail-api-result.png)
3. Click **Enable**
   ![Enable button](docs/screenshots/2.2-enable-button.png)
4. After enabling, Google shows the Gmail API details page with **Status: Enabled**. You can leave this page — the next step happens in the sidebar.
   ![Gmail API enabled](docs/screenshots/2.2-gmail-api-enabled.png)

### 2.3 — Configure the OAuth consent screen
Google recently replaced the old "consent screen" page with a 4-step wizard on the **Google Auth Platform**.

1. Left sidebar → **OAuth consent screen** (or **Google Auth Platform → Overview**)
   ![Sidebar OAuth consent](docs/screenshots/2.3-sidebar-oauth-consent.png)
2. Click the blue **Get started** button. A 4-step wizard opens.
3. **Step 1 — App Information:** App name `Gmail MCP Private`, User support email = your Gmail → **Next**
   ![App info](docs/screenshots/2.3-step1-app-info.png)
4. **Step 2 — Audience:** select **External** → **Next**
   ![Audience external](docs/screenshots/2.3-step2-audience.png)
5. **Step 3 — Contact Information:** your email → **Next**
   ![Contact info](docs/screenshots/2.3-step3-contact.png)
6. **Step 4 — Finish:** check "I agree to the Google API Services: User Data Policy" → **Continue** → **Create**
   ![Finish](docs/screenshots/2.3-step4-finish.png)
7. Now add yourself as a test user: left sidebar → **Audience** → scroll to **Test users** → **+ Add users**
   ![Audience add users](docs/screenshots/2.3-audience-add-users.png)
8. Enter your Gmail address → **Save**
   ![Test user save](docs/screenshots/2.3-test-user-save.png)

> **Important:** The consent screen stays in **Testing mode**. That's enough for personal use. Side effect: your refresh token expires after **7 days** and you'll need to run `npm run setup` again. If that's annoying, switch to "In Production" later — no Google verification needed while you stay below 100 users (guaranteed for a private server).

### 2.4 — Create OAuth credentials
1. On the Google Auth Platform **Overview** page click **Create OAuth client** (or left sidebar → **Clients → + Create client**)
   ![Create OAuth client button](docs/screenshots/2.4-create-oauth-client-button.png)
2. **Application type:** Desktop app — **required**. "Web application" will not work because `setup-auth.js` uses a dynamic `localhost` port that cannot be registered there.
   ![Application type dropdown](docs/screenshots/2.4-application-type-dropdown.png)
3. Name it, e.g., `gmail-mcp-desktop` → **Create**
   ![Desktop app form](docs/screenshots/2.4-desktop-app-form.png)
4. In the popup click **DOWNLOAD JSON** — a file called `client_secret_…apps.googleusercontent.com.json` lands in your Downloads folder
   ![Client created download JSON](docs/screenshots/2.4-client-created-download-json.png)
5. **Move it into a credentials folder in your home directory.** The server expects the file at the exact path
   `~/credentials/gmail-mcp-credentials/credentials.json`. Pick whichever option feels easier:

   **Option A — Finder (no terminal):**
   - Open a Finder window and press <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> to jump to your home folder
   - Create a new folder called **`credentials`**
   - Inside it create another folder called **`gmail-mcp-credentials`**
   - Drag the downloaded `client_secret_….json` file into that folder
   - Rename it to exactly **`credentials.json`**

   **Option B — Terminal (one command):**
   ```bash
   mkdir -p ~/credentials/gmail-mcp-credentials
   mv ~/Downloads/client_secret_*.apps.googleusercontent.com.json \
      ~/credentials/gmail-mcp-credentials/credentials.json
   chmod 600 ~/credentials/gmail-mcp-credentials/credentials.json
   ```

   Either way, the final file must be at:
   `~/credentials/gmail-mcp-credentials/credentials.json`

## Step 3 — Authenticate

```bash
cd ~/MCP/gmail-mcp
npm run setup
```

- Opens your browser with the Google login
- Sign in with the test user from step 2.3
- Google will warn: **"Google hasn't verified this app"** → `Advanced` → `Go to gmail-mcp-private (unsafe)` — this is expected because the app is in test mode and only you use it
- Confirm the scope (read/write Gmail)
- Browser shows **"Authentication successful!"** — close the window
- Your refresh token is now at `~/credentials/gmail-mcp-credentials/tokens.json` (chmod 600)

## Step 4 — Wire into Claude Desktop

You need to add the server to Claude Desktop's config file. The fastest
way is from inside the app itself:

1. Open the **Claude** menu in the macOS menu bar → **Settings…**
2. Switch to the **Developer** tab
3. Click **Edit Config** — Claude opens
   `~/Library/Application Support/Claude/claude_desktop_config.json` in
   your default editor (creating it if it doesn't exist yet)
4. Add the `gmail` block inside `mcpServers`:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/YOU/MCP/gmail-mcp/index.js"]
    }
  }
}
```

5. Save the file
6. **Quit Claude Desktop completely** (Cmd+Q — not just close the window) and reopen it. The Gmail tools appear in the tool picker.

**Important:**
- Replace `/Users/YOU/` with your actual home directory path
- Use absolute paths only (no `~`, no `./`)
- Use the **full path to `node`**. Find yours in the terminal with `which node` — usually `/opt/homebrew/bin/node` on Apple Silicon Macs or `/usr/local/bin/node` on Intel. Claude Desktop does **not** inherit your shell `PATH`, so a bare `"command": "node"` will fail silently.

If Claude doesn't see the tools after restart, open the Developer tab again — there's a log viewer that shows MCP server startup errors.

## Token refresh

In OAuth consent screen testing mode, refresh tokens expire after **7 days**. Symptom: on any tool call Claude sees "Token expired. Please run in the terminal…". Fix:

```bash
cd ~/MCP/gmail-mcp
npm run setup
```

Then restart Claude.

Alternative: switch the app to **"In Production"** in Google Cloud Console (OAuth consent screen → "Publish App"). As long as you stay under 100 users, no Google verification is needed and tokens stop expiring.

## Kill switch / revoking access

- **Immediate revocation:** [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → `Gmail MCP Private` (or whatever you named it) → **Remove access**. All existing tokens are invalidated instantly.
- **Full teardown:** Google Cloud Console → delete the project (`IAM & Admin → Settings → Shut down project`).
- **Local:** delete `~/credentials/gmail-mcp-credentials/` — the server will have no tokens left on disk.

## Project structure

```
gmail-mcp/
├── auth.js          OAuth 2.0 token management (singleton, auto-refresh)
├── gmail.js         26 Gmail API functions (retry, quota, cache, batch)
├── index.js         MCP server, tool definitions, audit log, rate limits
├── setup-auth.js    One-time OAuth setup with local callback web server
├── package.json
├── package-lock.json
├── README.md
├── INSTALL.md
├── SECURITY.md
└── FEATURES.md
```

Credentials and tokens live **outside** the project directory under `~/credentials/gmail-mcp-credentials/` — deliberately, so they are never picked up by any project-level backup or versioning tool.

---

## Optional — Advanced configuration

You don't need any of this for a normal setup. Skip unless you have a specific reason.

### Environment variables

You can tune behavior via the `env` block in the MCP config:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/YOU/MCP/gmail-mcp/index.js"],
      "env": {
        "GMAIL_MCP_APPLE_MAIL_ACCOUNT": "you@example.com",
        "GMAIL_MCP_PROFILE": "admin",
        "GMAIL_MCP_ELICIT": "on"
      }
    }
  }
}
```

| Variable | Effect | Default |
|---|---|---|
| `GMAIL_MCP_APPLE_MAIL_ACCOUNT` | Required if you want `open_in_apple_mail`. Must match the **Description** of your Google account exactly as it appears in Apple Mail → Settings → Accounts (often the email address itself, e.g., `you@example.com`) | _(empty)_ |
| `GMAIL_MCP_APPLE_MAIL_MAILBOXES` | Comma-separated list of mailboxes that `open_in_apple_mail` searches in order | `INBOX,All Mail` |
| `GMAIL_MCP_PROFILE` | `read`, `write`, or `admin` — see Tool profiles below | `admin` |
| `GMAIL_MCP_ELICIT` | `off` disables the confirmation prompts (not recommended) | `on` |

### Tool profiles

| Profile | Tools | Description | Recommended OAuth scope |
|---|---:|---|---|
| `read` | 10 | Read-only tools | `gmail.readonly` |
| `write` | 24 | Read + reversible writes (send, draft, label, star, mark) | `gmail.modify` |
| `admin` (default) | 26 | Everything, including `move_to_trash`, `batch_modify`, `delete_label`, `delete_draft` | `gmail.modify` |

`gmail.readonly` blocks write operations **at Google's server side** — the strongest guarantee. If you want Claude to read only, set the profile to `read` **and** grant only `gmail.readonly` during OAuth setup.

> **Scope switch note:** The OAuth scope is hard-coded in `auth.js` line 9 (`SCOPES = ['https://www.googleapis.com/auth/gmail.modify']`). To use `gmail.readonly` you must edit that line once and then run `npm run setup` again so Google issues a new token with the reduced scope.
