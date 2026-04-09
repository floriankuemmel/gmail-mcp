# Feature Roadmap

## Next up (Top 3)

### Vacation Responder
Toggle the out-of-office auto-reply via `users.settings.updateVacation`. Very common everyday request. Low effort.

### Gmail Filter CRUD
`users.settings.filters` — create, read, update and delete filters. Lets Claude automate Gmail itself.

### Send As / Signature
`users.settings.sendAs` — manage aliases and signatures. Maintain multiple sender addresses without touching the Gmail UI.

## More ideas (Google REST API)

- **Label colors & visibility** — extend `create_label`
- **Forwarding addresses & auto-forwarding** — manage forward rules
- **threads.modify / threads.trash** — bulk-edit entire threads
- **IMAP/POP settings** (`users.settings.imap`)
- **Full-headers extraction** — SPF/DKIM/DMARC inspection
- **Message/attachment size** — "show me the 10 largest mails"
- **Inline images** in HTML mails (`cid:` references)
- **Resumable upload** for attachments larger than 25 MB
- **Watch / push notifications** via Pub/Sub
- **People API** — search contacts by name (needs extra OAuth scope)
- **Bulk unsubscribe** — automatically unsubscribe from newsletters
- **Reply tracker** — track mails that are still waiting for a reply
- **Scheduled send**
- **Email analytics** — response times, volume
- **MCP annotations** — readOnlyHint / destructiveHint
- **Multi-account**

## Planned

### Publishing status "In Production" (optional)
If the 7-day token refresh cycle becomes annoying: flip the Google Cloud Console app from "Testing" to "In Production". Tokens then no longer expire. Does not require Google verification below 100 users, but is less restrictive than testing mode.

### Send-As / alias support
Optional `from` parameter on `send_email`, `reply_email` etc. to send from a configured Gmail alias address.

### MCP annotations
Set `readOnlyHint`, `destructiveHint`, `idempotentHint` on all tools. Helps Claude pick the right tool and prevents accidental destructive actions.

### Vacation responder
Toggle the out-of-office auto-reply via the Gmail Settings API (`users.settings.updateVacation`).

### Additional export formats
Export mails as JSON, TXT or HTML (not just `.eml`).

### Contact search
Wire up the Google People API. Look up recipients by name instead of having to remember the email address. Requires an additional OAuth scope.

### Gmail filter CRUD
Create, read, update and delete Gmail filters via the API. Currently only possible through the Gmail web UI.

### Multi-account
Manage multiple Gmail accounts. Account parameter on every tool, separate token files per account.

### Scheduled send
Write a mail now, send it at a specific future time.

### Email analytics
Statistics: who writes the most, response times, mail volume per day/week/month.

### Bulk unsubscribe
Automate newsletter unsubscription. Extract and follow unsubscribe links from mails.

### Reply tracker
Track mails you still need to reply to, and mails where you are waiting for an answer.

## Open tests

The following tools are implemented but not yet fully live-tested:
- forward_email (including attachments)
- create_draft
- create_reply_draft
- send_draft
- batch_modify
- mark_unread
- open_in_apple_mail (re-test after fix)

## Done

- `create_label` tool added (idempotent, case-insensitive)
- `batch_modify` extended with `add_label` / `remove_label` — bulk labelling without a loop
- `delete_label` and `delete_draft` cleanup tools (with elicitation)
- All runtime-visible strings in English
- Screenshots + new Google Auth Platform wizard UI in INSTALL.md
- Red-team security audit + SECURITY.md / FEATURES.md written
- Project moved to `~/MCP/gmail-mcp/` (previously under `Documents/01 Projekte/`)
- Claude Desktop config updated to the new path
- 22 Gmail tools implemented (incl. list_drafts)
- Apple Mail integration (search via subject+sender, automatic mailbox scanning)
- RFC 2047 encoding for umlauts in To/Cc/Bcc
- Audit log with 10 MB rotation
- Security hardening (MIME injection, AppleScript injection, batchModify limit)
- Auto-redirect OAuth setup with a local web server (no more manual code copying)
- HTML mail support (multipart/alternative with XSS protection)
- Attachment upload when sending (local files, automatic MIME-type detection, 25 MB limit)
- Symlink and directory protection for attachments (lstat instead of stat)
- Cryptographic MIME boundaries (`crypto.randomUUID` instead of `Math.random`)
- Multi-perspective security audits (Google, Apple, MCP — all passed)
- README.md, ROADMAP.md, PROGRAMMIERANLEITUNG.md created
- Server-side token savings: HTML→text conversion in `read_email` / `read_thread`, `search_emails` default limit 5 + bug fix, `list_labels` counts optional, param aliases for `messageId`, response hygiene (empty fields dropped). HTML mails ~20× smaller, search returns exactly the requested limit.
- Token savings stage 2: `view` parameter (`summary` / `compact` / `full`) for `read_email` and `read_thread`. In the `compact` default, quoted replies, RFC-3676 signatures and URL tracking parameters (`utm_*`, `fbclid`, `mc_cid` etc.) are stripped. Auth tokens in URLs (`token`, `code`, `key`) are left untouched. `read_thread` additionally does thread diffing — quoted passages from later messages are removed. Tool descriptions slimmed down (~1–2k tokens saved per session start).
- `list_drafts` bug fix: return `drafts: []` explicitly instead of relying on `compact()` which stripped empty arrays and broke the output schema.
</content>
</invoke>