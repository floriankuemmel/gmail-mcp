# Features

## What makes it different

- **Runs only on your Mac.** No cloud, no proxy. Your mails and Google login never leave your machine.
- **Credentials in macOS Keychain.** OAuth client secrets and tokens are stored in the system Keychain, not as files on disk. Nothing to accidentally sync, backup, or commit.
- **Protects you from malicious mails.** A crafted email could try to trick Claude into forwarding your inbox to a stranger. This server blocks that with multiple safeguards.
- **Asks before sending.** Claude can't send, reply, forward, trash, or bulk-modify without showing you the action first. If something goes wrong, a built-in limit stops runaway loops.
- **Uses far fewer tokens.** Long email threads normally balloon your context because every reply quotes the previous ones. This server strips the repeats before Claude sees them.
- **Apple Mail integration.** Ask Claude to "open this in Mail" and it does.

## All 24 tools

### Search and read

| Tool | What it does |
|---|---|
| `search_emails` | Find mails by sender, subject, date, label, or any Gmail search operator |
| `read_email` | Read a single mail in summary, compact (cleaned), or full (raw) view |
| `read_thread` | Read an entire conversation with automatic quote stripping |
| `get_profile` | Show your email address and mailbox statistics |
| `history_changes` | Incremental sync of all changes since a given point in time |
| `list_labels` | List all labels with optional message counts |

### Compose and send

| Tool | What it does |
|---|---|
| `send_email` | Send a new mail with optional attachments (up to 25 MB) |
| `reply_email` | Reply (or reply-all) with correct threading |
| `forward_email` | Forward a mail including its original attachments |
| `create_draft` | Save a new draft without sending |
| `create_reply_draft` | Save a reply draft with correct threading |
| `update_draft` | Replace the content of an existing draft |
| `send_draft` | Send a previously saved draft |
| `delete_draft` | Permanently delete a draft |
| `list_drafts` | List all saved drafts with recipient, subject, and snippet |

### Organize

| Tool | What it does |
|---|---|
| `archive_email` | Remove a mail from the inbox (keeps it in All Mail) |
| `move_to_trash` | Move a mail to the trash |
| `mark_read` | Mark a mail as read or unread |
| `star_email` | Star or unstar a mail |
| `set_label` | Add or remove a label from a mail |
| `manage_label` | Create or delete a user label |
| `batch_modify` | Apply an action (archive, trash, read, unread, star, unstar, add/remove label) to multiple mails at once |

### Export and integration

| Tool | What it does |
|---|---|
| `export` | Save a mail as .eml or download its attachments |
| `open_in_apple_mail` | Open a mail directly in Apple Mail (with date-based matching) |

## Design trade-offs

This server is built around a different trade-off than hosted Gmail integrations: it runs locally on your Mac, asks for confirmation before any write action, and strips quoted thread history so long conversations stay cheap in context. Those choices make it a good fit if you want to keep your mail on your own machine and burn fewer tokens on routine work, and a worse fit if you want a zero-setup, cloud-hosted connector. The numbers below show the practical effect of the quoted-history stripping.

## Token usage

This server has more tools than a minimal Gmail connector, so the tool definitions in the system prompt are larger. The trade-off: every tool result is significantly smaller because quoted thread history, signatures, and tracking pixels are stripped before Claude sees them.

Per-operation comparison, measured on the same Gmail account and the same messages:

| Operation | This server | Hosted Gmail connector | Savings |
|---|---:|---:|---:|
| Read your profile | ~30 tokens | ~160 tokens | 5x less |
| List your labels | ~150 tokens | ~530 tokens | 3x less |
| List drafts | ~45 tokens | ~240 tokens | 5x less |
| Search 20 mails | ~1 260 tokens | ~2 630 tokens | 2x less |
| Read one reply in a thread | ~280 tokens | ~1 460 tokens | 5x less |

The more tools Claude uses in a conversation, the more the smaller results add up. For short single-tool queries, a connector with fewer tools may use less total context. For longer sessions with multiple reads and searches, the per-result savings outweigh the larger system prompt.

If you ever need the raw, unstripped version of a mail, you can request it with `view: "full"`.

*Token counts measured on a single personal Gmail account in April 2026 using Claude Desktop. Actual results will vary depending on your mails, labels, thread length, Claude version, and the connector compared against. These numbers are provided as a rough indication, not as a benchmark.*

## Configuration

### Per-tool permissions in Claude Desktop

Every one of the 24 tools is individually visible in Claude Desktop's settings. To find them: Settings > Connectors > gmail > Configure. For each tool you can choose one of three modes:

| Mode | Behavior |
|---|---|
| **Allow automatically** | Claude uses the tool without asking |
| **Require confirmation** | Claude shows what it wants to do and waits for your approval |
| **Block** | Claude cannot use the tool at all |

This gives you fine-grained control without touching any configuration files. For example, you could allow all read tools automatically but require confirmation for `send_email` and `forward_email`.

### Tool profiles via environment variables

For a broader approach, the server supports three profiles that pre-select which tools are registered at startup:

| Profile | Tools | Use case |
|---|---:|---|
| `read` | 9 | Read-only access. No write operations are exposed to Claude. |
| `write` | 22 | Read + reversible writes (send, draft, label, star, mark). |
| `admin` (default) | 24 | Full access including trash, bulk actions, and deletions. |

Set the profile in your Claude Desktop config:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/YOU/MCP/gmail-mcp/index.js"],
      "env": {
        "GMAIL_MCP_PROFILE": "read"
      }
    }
  }
}
```

### Other environment variables

| Variable | Effect | Default |
|---|---|---|
| `GMAIL_MCP_PROFILE` | `read`, `write`, or `admin` (see above) | `admin` |
| `GMAIL_MCP_ELICIT` | `off` disables confirmation prompts before write actions (not recommended) | `on` |
| `GMAIL_MCP_APPLE_MAIL_ACCOUNT` | Required for `open_in_apple_mail`. Must match the account description in Apple Mail settings. | _(empty)_ |
| `GMAIL_MCP_APPLE_MAIL_MAILBOXES` | Comma-separated mailbox search order for `open_in_apple_mail` | `INBOX,All Mail` |

See [INSTALL.md](./INSTALL.md#optional--advanced-configuration) for the full setup walkthrough.
