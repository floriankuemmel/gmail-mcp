 # Features

## What it can do

The server gives Claude 27 tools to work with your Gmail:

- **Read** your inbox — search, open a single mail, read a whole thread, list labels and drafts
- **Write** new mails, replies, and forwards
- **Work with drafts** — create, update, send, or delete them
- **Organize** your mailbox — create/delete labels, apply labels, archive, trash, star, mark read/unread, bulk actions
- **Export to your Mac** — save a mail as a `.eml` file, pull attachments into `~/Downloads/MailExports/`, or open the mail directly in Apple Mail

## What makes it different

- **Runs only on your Mac.** No cloud, no proxy — your mails and Google login never leave your machine.
- **Protects you from malicious mails.** A crafted email could try to trick Claude into forwarding your inbox to a stranger. This server blocks that with multiple safeguards.
- **Asks before sending.** Claude can't send, reply, forward, trash, or bulk-modify without showing you the action first. If something goes wrong, a built-in limit stops runaway loops.
- **Uses far fewer tokens.** Long email threads normally balloon your context because every reply quotes the previous ones. This server strips the repeats before Claude sees them.
- **Apple Mail integration.** Ask Claude to "open this in Mail" and it does.

## Design trade-offs

This server is built around a different trade-off than hosted Gmail integrations: it runs locally on your Mac, asks for confirmation before any write action, and strips quoted thread history so long conversations stay cheap in context. Those choices make it a good fit if you want to keep your mail on your own machine and burn fewer tokens on routine work — and a worse fit if you want a zero-setup, cloud-hosted connector. The numbers below show the practical effect of the quoted-history stripping.

## Uses fewer tokens

Measured on the same Gmail account and the same messages, compared to a hosted Gmail connector:

| Operation | This server | Hosted Gmail connector | Savings |
|---|---:|---:|---:|
| Read your profile | ~30 tokens | ~160 tokens | **5× less** |
| List your labels | ~150 tokens | ~530 tokens | **3× less** |
| List drafts | ~45 tokens | ~240 tokens | **5× less** |
| Search 20 mails | ~1 260 tokens | ~2 630 tokens | **2× less** |
| Read one reply in a thread | ~280 tokens | ~1 460 tokens | **5× less** |

A typical session (one search, three reads, one label list) costs roughly **3 500 tokens here vs. 7 000 with a hosted connector**. That means Claude can work on your mailbox about twice as long before running out of context.

The biggest savings come from stripping quoted thread history, signatures, and tracking pixels before Claude reads a mail. If you ever need the raw version, you can ask for it explicitly.

*Token counts measured by the author on a single personal Gmail account in April 2026 using Claude Desktop. Actual results will vary depending on your mails, labels, thread length, Claude version, and the current implementation of any connector compared against. These numbers are provided as a rough indication, not as a benchmark.*
