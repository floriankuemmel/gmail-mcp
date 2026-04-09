import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema, ListToolsRequestSchema,
  ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema,
  ErrorCode, McpError
} from '@modelcontextprotocol/sdk/types.js';
import Ajv from 'ajv';
import { appendFile, stat, rename } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';

const AUDIT_LOG = path.join(homedir(), 'credentials', 'gmail-mcp-credentials', 'audit.log');
const AUDIT_LOG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Audit log: metadata only, never mail content.
// F7: strip CRLF before writing to prevent log-line injection via subject/to.
// F13: exclude attachmentPaths (filesystem paths = PII) and summarize as count.
async function audit(toolName, args) {
  const timestamp = new Date().toISOString();
  const skip = new Set(['body', 'bodyText', 'bodyHtml', 'attachmentPaths']);
  const summary = Object.entries(args || {})
    .filter(([key]) => !skip.has(key))
    .map(([key, val]) => {
      const s = String(val).replace(/[\r\n]+/g, ' ').substring(0, 80);
      return `${key}: ${s}`;
    })
    .concat(
      Array.isArray(args?.attachmentPaths) && args.attachmentPaths.length
        ? [`attachmentPaths: <${args.attachmentPaths.length} file(s)>`]
        : []
    )
    .join(', ');
  const line = `${timestamp} | ${toolName} | ${summary}\n`;
  try {
    // Log rotation: if >10MB, rename the old file
    try {
      const info = await stat(AUDIT_LOG);
      if (info.size > AUDIT_LOG_MAX_BYTES) {
        await rename(AUDIT_LOG, `${AUDIT_LOG}.old`);
      }
    } catch { /* file does not exist yet */ }
    await appendFile(AUDIT_LOG, line);
  } catch {
    // Never let a log error crash the server
  }
}

import {
  getProfile, searchEmails, readEmail, readThread, listLabels,
  sendEmail, replyEmail, forwardEmail,
  createDraft, createReplyDraft, sendDraft, listDrafts,
  batchModify, archiveEmail, setLabel, createLabel, deleteLabel, deleteDraft, moveToTrash,
  markRead, markUnread, starEmail,
  exportEmail, exportAttachments, openInAppleMail,
  readDraft, updateDraft, historyChanges,
  takeMeta, quotaStore
} from './gmail.js';

const server = new Server(
  { name: 'mcp-gmail', version: '1.0.0' },
  { capabilities: { tools: {}, elicitation: {}, resources: {} } }
);

// MCP Resources: gmail://message/{id}, gmail://message/{id}/body,
// gmail://thread/{id}, gmail://labels. Clients can load bodies on demand
// instead of always receiving them inline in the tool result.
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'gmail://labels',
      name: 'Gmail Labels',
      description: 'All Gmail labels (name + ID)',
      mimeType: 'application/json'
    },
    {
      uri: 'gmail://drafts',
      name: 'Gmail Drafts',
      description: 'List of saved drafts',
      mimeType: 'application/json'
    }
  ]
}));

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: [
    {
      uriTemplate: 'gmail://message/{id}',
      name: 'Gmail Message',
      description: 'A Gmail message (compact view, wrapped body)',
      mimeType: 'application/json'
    },
    {
      uriTemplate: 'gmail://message/{id}/body',
      name: 'Gmail Message Body',
      description: 'Plain-text body only of a message',
      mimeType: 'text/plain'
    },
    {
      uriTemplate: 'gmail://thread/{id}',
      name: 'Gmail Thread',
      description: 'All messages in a thread (compact view)',
      mimeType: 'application/json'
    },
    {
      uriTemplate: 'gmail://draft/{id}',
      name: 'Gmail Draft',
      description: 'A single draft (headers + snippet)',
      mimeType: 'application/json'
    }
  ]
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri;
  const json = (data) => ({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] });

  if (uri === 'gmail://labels')  return json(await listLabels({}));
  if (uri === 'gmail://drafts')  return json(await listDrafts({}));

  let m;
  if ((m = uri.match(/^gmail:\/\/message\/([^/]+)\/body$/))) {
    const data = await readEmail({ messageId: m[1] });
    return { contents: [{ uri, mimeType: 'text/plain', text: data.bodyText || '' }] };
  }
  if ((m = uri.match(/^gmail:\/\/message\/([^/]+)$/)))  return json(await readEmail({ messageId: m[1] }));
  if ((m = uri.match(/^gmail:\/\/thread\/([^/]+)$/)))   return json(await readThread({ threadId: m[1] }));
  if ((m = uri.match(/^gmail:\/\/draft\/([^/]+)$/)))    return json(await readDraft(m[1]));

  throw new McpError(ErrorCode.InvalidParams, `Unknown resource URI: ${uri}`);
});

// Elicitation helper: shows the user a confirmation prompt and blocks until
// accepted or rejected. If the client does not support elicitation (older
// clients), the helper falls back to "proceed" — the audit log and the
// agent's verbal confirmation are the safety net in that case.
// Can be disabled entirely via GMAIL_MCP_ELICIT=off.
const ELICIT_DISABLED = process.env.GMAIL_MCP_ELICIT === 'off';
async function confirmAction(actionLabel, summary) {
  if (ELICIT_DISABLED) return;
  try {
    const res = await server.elicitInput({
      mode: 'form',
      message: `Please confirm: ${actionLabel}\n\n${summary}`,
      requestedSchema: {
        type: 'object',
        properties: {
          confirm: { type: 'boolean', description: 'true to execute' }
        },
        required: ['confirm']
      }
    });
    if (res.action !== 'accept' || !res.content?.confirm) {
      throw new McpError(ErrorCode.InvalidRequest, `Action rejected by user: ${actionLabel}`);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    // Client does not support elicitation — silently proceed; audit log covers it.
    if (/does not support/i.test(err?.message || '')) return;
    throw err;
  }
}

// Reusable output schemas. Deliberately loose (additionalProperties: true)
// because compact() strips empty fields and view modes return different
// fields. `required` only lists fields that are guaranteed to be present.
const OUTPUT_SCHEMAS = {
  get_profile: {
    type: 'object',
    properties: {
      emailAddress: { type: 'string' },
      messagesTotal: { type: 'number' },
      threadsTotal: { type: 'number' },
      historyId: { type: 'string' }
    },
    required: ['emailAddress'],
    additionalProperties: true
  },
  search_emails: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            threadId: { type: 'string' },
            from: { type: 'string' },
            subject: { type: 'string' },
            date: { type: 'string' },
            snippet: { type: 'string' },
            labels: { type: 'array', items: { type: 'string' } }
          },
          required: ['id'],
          additionalProperties: true
        }
      },
      nextCursor: { type: ['string', 'null'] },
      hasMore: { type: 'boolean' }
    },
    additionalProperties: true
  },
  read_email: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      threadId: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      subject: { type: 'string' },
      date: { type: 'string' },
      snippet: { type: 'string' },
      bodyText: { type: 'string' },
      bodyHtml: { type: 'string' },
      attachments: { type: 'array' },
      labels: { type: 'array', items: { type: 'string' } }
    },
    required: ['id'],
    additionalProperties: true
  },
  read_thread: {
    type: 'object',
    properties: {
      threadId: { type: 'string' },
      messageCount: { type: 'number' },
      messages: { type: 'array' }
    },
    required: ['threadId', 'messages'],
    additionalProperties: true
  },
  list_labels: {
    type: 'object',
    properties: {
      labels: { type: 'array' }
    },
    required: ['labels'],
    additionalProperties: true
  },
  list_drafts: {
    type: 'object',
    properties: {
      drafts: { type: 'array' },
      total: { type: 'number' }
    },
    required: ['drafts'],
    additionalProperties: true
  },
  history_changes: {
    type: 'object',
    properties: {
      historyId: { type: 'string' },
      changes: { type: 'array' },
      nextPageToken: { type: ['string', 'null'] },
      count: { type: 'number' }
    },
    required: ['historyId'],
    additionalProperties: true
  },
  // Generisches Action-Result fuer alle veraendernden Tools
  action_result: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      messageId: { type: 'string' },
      draftId: { type: 'string' }
    },
    required: ['success'],
    additionalProperties: true
  }
};

// Pre-compile Ajv validators per schema. Belt-and-suspenders: we validate
// our own structuredContent outputs against the declared outputSchema before
// they go out — catches bugs that would otherwise leak data into the wrong
// fields.
const _ajv = new Ajv({ allErrors: true, strict: false });
const _validators = Object.fromEntries(
  Object.entries(OUTPUT_SCHEMAS).map(([k, schema]) => [k, _ajv.compile(schema)])
);

// Mapping tool name → outputSchema key (action_result for write tools)
const TOOL_OUTPUT = {
  get_profile: 'get_profile',
  search_emails: 'search_emails',
  read_email: 'read_email',
  read_thread: 'read_thread',
  list_labels: 'list_labels',
  list_drafts: 'list_drafts',
  history_changes: 'history_changes',
  update_draft: 'action_result',
  send_email: 'action_result',
  reply_email: 'action_result',
  forward_email: 'action_result',
  create_draft: 'action_result',
  create_reply_draft: 'action_result',
  send_draft: 'action_result',
  delete_draft: 'action_result',
  batch_modify: 'action_result',
  archive_email: 'action_result',
  set_label: 'action_result',
  create_label: 'action_result',
  delete_label: 'action_result',
  move_to_trash: 'action_result',
  mark_read: 'action_result',
  mark_unread: 'action_result',
  star_email: 'action_result',
  export_email: 'action_result',
  export_attachments: 'action_result',
  open_in_apple_mail: 'action_result'
};

// Compact args summary for the elicitation message (never includes body content)
function summarizeForConfirm(args) {
  const fields = ['to', 'cc', 'bcc', 'subject', 'messageId', 'messageIds', 'action', 'threadId', 'labelName', 'labelId', 'draftId'];
  return fields
    .filter(f => args?.[f])
    .map(f => {
      const v = args[f];
      const s = Array.isArray(v) ? `${v.length} IDs` : String(v).slice(0, 120);
      return `${f}: ${s}`;
    })
    .join('\n');
}

// Local rate limits to contain runaway loops from an agent. Sliding window
// per tool name. Deliberately tight for destructive/sending tools.
const RATE_LIMITS = {
  send_email:    { max: 10, windowMs: 5 * 60 * 1000 },
  reply_email:   { max: 10, windowMs: 5 * 60 * 1000 },
  forward_email: { max: 10, windowMs: 5 * 60 * 1000 },
  send_draft:    { max: 10, windowMs: 5 * 60 * 1000 },
  batch_modify:  { max:  5, windowMs: 5 * 60 * 1000 },
  move_to_trash: { max: 30, windowMs: 5 * 60 * 1000 }
};
const _rateHistory = new Map(); // toolName → [timestamps]
function checkRateLimit(name) {
  const cfg = RATE_LIMITS[name];
  if (!cfg) return;
  const now = Date.now();
  const cutoff = now - cfg.windowMs;
  const hist = (_rateHistory.get(name) || []).filter(t => t > cutoff);
  if (hist.length >= cfg.max) {
    const waitSec = Math.ceil((hist[0] + cfg.windowMs - now) / 1000);
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Rate limit for ${name}: max ${cfg.max} per ${cfg.windowMs/60000} min. Retry in ${waitSec}s.`
    );
  }
  hist.push(now);
  _rateHistory.set(name, hist);
}

// Tool profiles shrink the exposed toolset, which also reduces context
// tokens + attack surface. read = read-only tools, write = + reversible
// write tools, admin = everything including destructive/bulk tools (default).
const PROFILE = (process.env.GMAIL_MCP_PROFILE || 'admin').toLowerCase();
const READ_TOOLS = new Set([
  'get_profile', 'search_emails', 'read_email', 'read_thread',
  'list_labels', 'list_drafts', 'history_changes',
  'export_email', 'export_attachments', 'open_in_apple_mail'
]);
const WRITE_TOOLS = new Set([
  ...READ_TOOLS,
  'send_email', 'reply_email', 'forward_email',
  'create_draft', 'create_reply_draft', 'update_draft', 'send_draft', 'delete_draft',
  'archive_email', 'set_label', 'create_label', 'mark_read', 'mark_unread', 'star_email'
]);
function isToolAllowed(name) {
  if (PROFILE === 'read') return READ_TOOLS.has(name);
  if (PROFILE === 'write') return WRITE_TOOLS.has(name);
  return true; // admin
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: _toolDefs
    .filter(t => isToolAllowed(t.name))
    .map(t => {
      const key = TOOL_OUTPUT[t.name];
      return key ? { ...t, outputSchema: OUTPUT_SCHEMAS[key] } : t;
    })
}));

const _toolDefs = [
    {
      name: 'get_profile',
      description: 'Email address and statistics of the Gmail account.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'search_emails',
      description: 'Searches Gmail using all Gmail operators (from:, subject:, after:, label:, is:unread, has:attachment ...). Default 5 hits, max 50.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 5 },
          cursor: { type: 'string', description: 'Opaque cursor from nextCursor of a previous response.' }
        },
        required: ['query']
      }
    },
    {
      name: 'read_email',
      description: 'Reads a mail. view: "summary" (headers+snippet only), "compact" (plaintext, quotes/signature/tracking stripped — default), "full" (complete body unchanged). includeHtml=true for HTML.',
      inputSchema: {
        type: 'object',
        properties: {
          messageId: { type: 'string', description: 'Aliases: id, email_id, message_id' },
          view: { type: 'string', enum: ['summary', 'compact', 'full'], default: 'compact' },
          includeHtml: { type: 'boolean', default: false },
          includeAttachmentIds: { type: 'boolean', default: false }
        }
      }
    },
    {
      name: 'read_thread',
      description: 'Reads all messages in a thread. view like read_email; in "compact" quoted passages from later messages are removed (thread-diffing). messagesLimit limits to the last N.',
      inputSchema: {
        type: 'object',
        properties: {
          threadId: { type: 'string' },
          view: { type: 'string', enum: ['summary', 'compact', 'full'], default: 'compact' },
          includeHtml: { type: 'boolean', default: false },
          messagesLimit: { type: 'number' }
        },
        required: ['threadId']
      }
    },
    {
      name: 'list_labels',
      description: 'Lists Gmail labels (name+ID). includeCounts=true for counts.',
      inputSchema: {
        type: 'object',
        properties: {
          includeCounts: { type: 'boolean', default: false }
        }
      }
    },
    {
      name: 'send_email',
      description: 'Sends an email. body=plaintext, bodyHtml=HTML (optional). attachmentPaths max 25 MB.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          bodyHtml: { type: 'string' },
          cc: { type: 'string' },
          bcc: { type: 'string' },
          attachmentPaths: { type: 'array', items: { type: 'string' } },
          confirmedTaintOverride: { type: 'boolean', description: 'Only set when the server raises a security warning and the user explicitly agrees.' }
        },
        required: ['to', 'subject', 'body']
      }
    },
    {
      name: 'reply_email',
      description: 'Replies to a mail with correct threading. replyAll=true for reply-all.',
      inputSchema: {
        type: 'object',
        properties: {
          messageId: { type: 'string' },
          body: { type: 'string' },
          bodyHtml: { type: 'string' },
          replyAll: { type: 'boolean', default: false },
          attachmentPaths: { type: 'array', items: { type: 'string' } },
          confirmedTaintOverride: { type: 'boolean', description: 'Only set when the server raises a security warning and the user explicitly agrees.' }
        },
        required: ['messageId', 'body']
      }
    },
    {
      name: 'forward_email',
      description: 'Forwards a mail (including original attachments).',
      inputSchema: {
        type: 'object',
        properties: {
          messageId: { type: 'string' },
          to: { type: 'string' },
          body: { type: 'string' },
          bodyHtml: { type: 'string' },
          confirmedTaintOverride: { type: 'boolean', description: 'Only set when the server raises a security warning and the user explicitly agrees.' }
        },
        required: ['messageId', 'to']
      }
    },
    {
      name: 'create_draft',
      description: 'Creates a draft without sending.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          bodyHtml: { type: 'string' },
          cc: { type: 'string' },
          bcc: { type: 'string' },
          attachmentPaths: { type: 'array', items: { type: 'string' } }
        },
        required: ['to', 'subject', 'body']
      }
    },
    {
      name: 'create_reply_draft',
      description: 'Creates a reply draft with correct threading.',
      inputSchema: {
        type: 'object',
        properties: {
          messageId: { type: 'string' },
          body: { type: 'string' },
          bodyHtml: { type: 'string' },
          replyAll: { type: 'boolean', default: false },
          attachmentPaths: { type: 'array', items: { type: 'string' } }
        },
        required: ['messageId', 'body']
      }
    },
    {
      name: 'update_draft',
      description: 'Updates an existing draft (full replacement of recipients, subject, body, attachments).',
      inputSchema: {
        type: 'object',
        properties: {
          draftId: { type: 'string' },
          to: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          bodyHtml: { type: 'string' },
          cc: { type: 'string' },
          bcc: { type: 'string' },
          attachmentPaths: { type: 'array', items: { type: 'string' } }
        },
        required: ['draftId', 'to', 'subject', 'body']
      }
    },
    {
      name: 'history_changes',
      description: 'Incremental sync: all changes since startHistoryId (from get_profile). Returns added/removed mails and label changes. Gmail keeps history ~7 days.',
      inputSchema: {
        type: 'object',
        properties: {
          startHistoryId: { type: 'string' },
          historyTypes: { type: 'array', items: { type: 'string', enum: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'] } },
          labelId: { type: 'string' },
          maxResults: { type: 'number', default: 100 },
          pageToken: { type: 'string' }
        },
        required: ['startHistoryId']
      }
    },
    {
      name: 'list_drafts',
      description: 'Lists saved drafts (to, subject, snippet, draftId). Default 10, max 50.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 10 }
        }
      }
    },
    {
      name: 'send_draft',
      description: 'Sends an existing draft.',
      inputSchema: {
        type: 'object',
        properties: { draftId: { type: 'string' } },
        required: ['draftId']
      }
    },
    {
      name: 'delete_draft',
      description: 'Permanently deletes a draft by draftId. Does not send the draft.',
      inputSchema: {
        type: 'object',
        properties: { draftId: { type: 'string' } },
        required: ['draftId']
      }
    },
    {
      name: 'batch_modify',
      description: 'Action on multiple mails: archive, trash, read, unread, star, unstar, add_label, remove_label. For add_label/remove_label a labelName is required (label must already exist — use create_label first).',
      inputSchema: {
        type: 'object',
        properties: {
          messageIds: { type: 'array', items: { type: 'string' } },
          action: { type: 'string', enum: ['archive', 'trash', 'read', 'unread', 'star', 'unstar', 'add_label', 'remove_label'] },
          labelName: { type: 'string', description: 'Required for add_label / remove_label.' }
        },
        required: ['messageIds', 'action']
      }
    },
    {
      name: 'archive_email',
      description: 'Archives a mail (removes INBOX label).',
      inputSchema: {
        type: 'object',
        properties: { messageId: { type: 'string' } },
        required: ['messageId']
      }
    },
    {
      name: 'set_label',
      description: 'Adds or removes a label. createIfMissing creates a missing label.',
      inputSchema: {
        type: 'object',
        properties: {
          messageId: { type: 'string' },
          labelName: { type: 'string' },
          action: { type: 'string', enum: ['add', 'remove'] },
          createIfMissing: { type: 'boolean', default: false }
        },
        required: ['messageId', 'labelName', 'action']
      }
    },
    {
      name: 'create_label',
      description: 'Creates a new user label. Returns the label ID. If the label already exists (case-insensitive), returns the existing one.',
      inputSchema: {
        type: 'object',
        properties: {
          labelName: { type: 'string' }
        },
        required: ['labelName']
      }
    },
    {
      name: 'delete_label',
      description: 'Permanently deletes a user label. Does not delete the mails carrying the label. System labels cannot be deleted.',
      inputSchema: {
        type: 'object',
        properties: {
          labelName: { type: 'string' },
          labelId: { type: 'string' }
        }
      }
    },
    {
      name: 'move_to_trash',
      description: 'Moves mail to trash.',
      inputSchema: {
        type: 'object',
        properties: { messageId: { type: 'string' } },
        required: ['messageId']
      }
    },
    {
      name: 'mark_read',
      description: 'Marks mail as read.',
      inputSchema: {
        type: 'object',
        properties: { messageId: { type: 'string' } },
        required: ['messageId']
      }
    },
    {
      name: 'mark_unread',
      description: 'Marks mail as unread.',
      inputSchema: {
        type: 'object',
        properties: { messageId: { type: 'string' } },
        required: ['messageId']
      }
    },
    {
      name: 'star_email',
      description: 'Stars/unstars a mail.',
      inputSchema: {
        type: 'object',
        properties: {
          messageId: { type: 'string' },
          starred: { type: 'boolean' }
        },
        required: ['messageId', 'starred']
      }
    },
    {
      name: 'export_email',
      description: 'Saves mail as .eml under ~/Downloads/MailExports/.',
      inputSchema: {
        type: 'object',
        properties: { messageId: { type: 'string' } },
        required: ['messageId']
      }
    },
    {
      name: 'export_attachments',
      description: 'Downloads all attachments of a mail to ~/Downloads/MailExports/Attachments/.',
      inputSchema: {
        type: 'object',
        properties: { messageId: { type: 'string' } },
        required: ['messageId']
      }
    },
    {
      name: 'open_in_apple_mail',
      description: 'Opens a mail in Apple Mail (macOS only).',
      inputSchema: {
        type: 'object',
        properties: { messageId: { type: 'string' } },
        required: ['messageId']
      }
    }
];

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Profile check: block tools not allowed in the current profile
  if (!isToolAllowed(name)) {
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Tool '${name}' is not available in profile '${PROFILE}'. Enable it via GMAIL_MCP_PROFILE=admin.`
    );
  }

  // Rate limit for destructive/sending tools
  checkRateLimit(name);

  return await quotaStore.run({ cost: 0 }, async () => {
  try {
    // Confirmation for all mutating / sending actions
    const CONFIRM_ACTIONS = {
      send_email: 'Send email',
      reply_email: 'Send reply',
      forward_email: 'Forward email',
      send_draft: 'Send draft',
      move_to_trash: 'Move to trash',
      batch_modify: 'Batch modify multiple mails',
      delete_label: 'Delete label permanently',
      delete_draft: 'Delete draft permanently'
    };
    if (CONFIRM_ACTIONS[name]) {
      await confirmAction(CONFIRM_ACTIONS[name], summarizeForConfirm(args));
    }

    await audit(name, args);
    let result;

    switch (name) {
      case 'get_profile':          result = await getProfile(); break;
      case 'search_emails':       result = await searchEmails(args); break;
      case 'read_email':          result = await readEmail(args); break;
      case 'read_thread':         result = await readThread(args); break;
      case 'list_labels':         result = await listLabels(args); break;
      case 'send_email':          result = await sendEmail(args); break;
      case 'reply_email':         result = await replyEmail(args); break;
      case 'forward_email':       result = await forwardEmail(args); break;
      case 'create_draft':        result = await createDraft(args); break;
      case 'create_reply_draft':  result = await createReplyDraft(args); break;
      case 'update_draft':        result = await updateDraft(args); break;
      case 'history_changes':     result = await historyChanges(args); break;
      case 'list_drafts':         result = await listDrafts(args); break;
      case 'send_draft':          result = await sendDraft(args); break;
      case 'delete_draft':        result = await deleteDraft(args); break;
      case 'batch_modify':         result = await batchModify(args); break;
      case 'archive_email':       result = await archiveEmail(args); break;
      case 'set_label':           result = await setLabel(args); break;
      case 'create_label':        result = await createLabel(args); break;
      case 'delete_label':        result = await deleteLabel(args); break;
      case 'move_to_trash':       result = await moveToTrash(args); break;
      case 'mark_read':           result = await markRead(args); break;
      case 'mark_unread':         result = await markUnread(args); break;
      case 'star_email':          result = await starEmail(args); break;
      case 'export_email':        result = await exportEmail(args); break;
      case 'export_attachments':  result = await exportAttachments(args); break;
      case 'open_in_apple_mail':  result = await openInAppleMail(args); break;
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    // Spec 2025-06-18: ship structuredContent alongside the text content so
    // clients can consume it type-safely without re-parsing.
    const structured = (result && typeof result === 'object' && !Array.isArray(result))
      ? result
      : { value: result };
    const meta = takeMeta(result) || {};
    const _qctx = quotaStore.getStore();
    if (_qctx?.cost) meta.quotaCost = _qctx.cost;

    // Defensive output-schema validation (warn-only, never blocks)
    const schemaKey = TOOL_OUTPUT[name];
    if (schemaKey && _validators[schemaKey]) {
      const valid = _validators[schemaKey](structured);
      if (!valid) {
        const errs = _validators[schemaKey].errors?.map(e => `${e.instancePath} ${e.message}`).join('; ');
        console.error(`[outputSchema] ${name} failed validation: ${errs}`);
        meta.outputSchemaWarning = errs;
      }
    }

    const resp = {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: structured
    };
    if (Object.keys(meta).length) resp._meta = meta;
    return resp;

  } catch (error) {
    // Re-throw McpError directly — the SDK handles it correctly
    if (error instanceof McpError) throw error;

    // Google API errors with a helpful message
    const status = error?.response?.status;
    if (status === 401) {
      throw new McpError(ErrorCode.InternalError,
        'Token expired. Please run in the terminal:\n\n'
        + `  cd "${process.cwd()}" && node setup-auth.js\n\n`
        + 'Then restart Claude Code.');
    }
    if (status === 429) {
      throw new McpError(ErrorCode.InternalError, 'Gmail API rate limit reached. Please wait a moment and retry.');
    }

    return {
      content: [{ type: 'text', text: `Fehler: ${error.message}` }],
      isError: true
    };
  }
  });
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Gmail MCP Server running');
}

main().catch(console.error);
