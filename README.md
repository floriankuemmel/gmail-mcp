# Gmail MCP Server

A local [MCP server](https://modelcontextprotocol.io/) that lets Claude Desktop (or Claude Code) read, write, organize, and export your Gmail. Runs entirely on your own Mac. No proxy, no cloud, nothing in between.

**27 tools**, built with a focus on safety and low token usage.

## What it can do

- **Search and read** your inbox, individual mails, and entire threads
- **Compose, reply, and forward** mails directly from Claude, with optional attachments
- **Draft management** with create, update, send, and delete
- **Organize** your mailbox with labels, archive, trash, star, read/unread, and bulk actions
- **Export** mails as .eml files, download attachments, or open directly in Apple Mail (macOS)
- **Privacy first** with local-only execution, macOS Keychain storage, strict input validation, and untrusted-content wrapping against prompt injection

See [FEATURES.md](./FEATURES.md) for the full tool reference.

## Token usage

This server strips quoted thread history, signatures, and tracking pixels before Claude reads a mail. That means Claude can work on your mailbox longer before running out of context.

| Operation | This server | Hosted connector | Savings |
|---|---:|---:|---:|
| Read your profile | ~30 tokens | ~160 tokens | 5x less |
| List your labels | ~150 tokens | ~530 tokens | 3x less |
| List drafts | ~45 tokens | ~240 tokens | 5x less |
| Search 20 mails | ~1 260 tokens | ~2 630 tokens | 2x less |
| Read one reply in a thread | ~280 tokens | ~1 460 tokens | 5x less |

A typical session (one search, three reads, one label list) costs roughly **3 500 tokens here vs. 7 000 with a hosted connector**.

*Token counts measured on a single personal Gmail account in April 2026 using Claude Desktop. Actual results will vary.*

## Configuration

Each of the 27 tools can be individually controlled in Claude Desktop's settings. For every tool you can choose to allow it automatically, require confirmation each time, or block it entirely. No code changes needed.

For more control, the server also supports three tool profiles via environment variables:

| Profile | Tools | Use case |
|---|---:|---|
| `read` | 10 | Read-only access, no write operations |
| `write` | 24 | Read + send, draft, label, star, mark |
| `admin` | 26 | Full access including trash, bulk actions, and deletions |

See [INSTALL.md](./INSTALL.md#optional--advanced-configuration) for all configuration options.

## Getting started

1. **[INSTALL.md](./INSTALL.md):** one-time setup (Google Cloud, credentials, Claude Desktop)
2. **[SECURITY.md](./SECURITY.md):** what the server does to protect your mailbox, and how to audit it yourself
3. **[FEATURES.md](./FEATURES.md):** the 27 tools and how this server compares to other Gmail MCPs

## Requirements

- macOS (Linux works too, except `open_in_apple_mail`)
- Node.js 18 or newer
- A Google account

## Disclaimer

This project is provided **"as is"**, without warranty of any kind. Use it at your own risk.

- This is a personal/community project and is **not affiliated with or endorsed by Google**.
- You are responsible for creating and managing your own Google Cloud credentials and OAuth tokens.
- **Never share** your `client_secret.json`, access tokens, or refresh tokens with anyone.
- The author assumes **no liability** for any data loss, unauthorized access, or other damages resulting from the use of this software.
- Make sure you comply with the [Google API Terms of Service](https://developers.google.com/terms) when using this project.

## Security Notice

- This MCP server handles sensitive Gmail data via OAuth 2.0. Keep your credentials safe.
- On macOS, credentials and tokens are stored in the macOS Keychain. On Linux, they are stored as files with `chmod 600` permissions.
- The OAuth consent screen will show this app as "unverified" unless you go through Google's verification process. This is normal for personal use.
- If you suspect your tokens have been compromised, revoke them immediately at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## License

This project is licensed under the [MIT License](LICENSE).

### Haftung nach deutschem Recht

Die Software wird unentgeltlich zur Verfügung gestellt. Eine Haftung des Autors besteht nur für Vorsatz und grobe Fahrlässigkeit (§§ 521, 599 BGB analog). Im Übrigen gilt die MIT-Lizenz.

## Acknowledgements

Special thanks to [David Sparks](https://www.macsparky.com) and his excellent [Robot Assistant Field Guide](https://learn.macsparky.com/p/rafg26), which taught me how to think about AI automation and gave me the motivation to build my own tools.

Built with the help of [Claude Code](https://claude.com/claude-code), Anthropic's CLI for agentic software development.
