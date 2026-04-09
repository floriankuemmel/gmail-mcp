# Gmail MCP Server

A local [MCP server](https://modelcontextprotocol.io/) that lets Claude Desktop (or Claude Code) read, write, organize, and export your Gmail. Runs entirely on your own Mac — no proxy, no cloud, nothing in between.

**27 tools**, built with a focus on safety and low token usage.

## Getting started

1. **[INSTALL.md](./INSTALL.md)** — one-time setup (Google Cloud, credentials, Claude Desktop)
2. **[SECURITY.md](./SECURITY.md)** — what the server does to protect your mailbox, and how to audit it yourself
3. **[FEATURES.md](./FEATURES.md)** — the 27 tools and how this server compares to other Gmail MCPs

## Requirements

- macOS (Linux works too, except `open_in_apple_mail`)
- Node.js 18 or newer
- A Google account

## ⚠️ Disclaimer

This project is provided **"as is"**, without warranty of any kind. Use it at your own risk.

- This is a personal/community project and is **not affiliated with or endorsed by Google**.
- You are responsible for creating and managing your own Google Cloud credentials and OAuth tokens.
- **Never share** your `client_secret.json`, access tokens, or refresh tokens with anyone.
- The author assumes **no liability** for any data loss, unauthorized access, or other damages resulting from the use of this software.
- Make sure you comply with the [Google API Terms of Service](https://developers.google.com/terms) when using this project.

## 🔐 Security Notice

- This MCP server handles sensitive Gmail data via OAuth 2.0. Keep your credentials safe.
- Tokens are stored locally on your machine. Do not commit them to version control.
- The OAuth consent screen will show this app as "unverified" unless you go through Google's verification process. This is normal for personal use.
- If you suspect your tokens have been compromised, revoke them immediately at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## 📄 License

This project is licensed under the [MIT License](LICENSE).

### Haftung nach deutschem Recht

Die Software wird unentgeltlich zur Verfügung gestellt. Eine Haftung des Autors besteht nur für Vorsatz und grobe Fahrlässigkeit (§§ 521, 599 BGB analog). Im Übrigen gilt die MIT-Lizenz.

## Acknowledgements

Built with the help of [Claude Code](https://claude.com/claude-code), Anthropic's CLI for agentic software development.
