import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync, chmodSync, renameSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

const CREDENTIALS_PATH = path.join(homedir(), 'credentials', 'gmail-mcp-credentials', 'credentials.json');
const TOKENS_PATH = path.join(homedir(), 'credentials', 'gmail-mcp-credentials', 'tokens.json');

export const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

// Singleton: cached OAuth2 client and Gmail client.
// Avoids race conditions on concurrent token refreshes
// and prevents an unnecessary disk read on every API call.
let cachedAuth = null;
let cachedGmail = null;
let reauthRequired = false;

export function getOAuth2Client() {
  const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
  // Security (F5): enforce chmod 0600 on the OAuth client secret file.
  // Prevents another local user from reading client_id/client_secret.
  try { chmodSync(CREDENTIALS_PATH, 0o600); } catch { /* best-effort */ }
  // Google Cloud Console produces either "installed" or "web" depending on client type
  const config = credentials.installed || credentials.web;
  if (!config) {
    throw new Error('credentials.json has unknown format. Expected "installed" or "web" key.');
  }
  const { client_secret, client_id, redirect_uris } = config;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

// Atomic write (F9): write to .tmp then rename, so a crash mid-write never
// leaves a truncated tokens.json.
function writeTokensAtomic(tokens) {
  const tmp = `${TOKENS_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(tokens, null, 2));
  chmodSync(tmp, 0o600);
  renameSync(tmp, TOKENS_PATH);
}

export function getAuthenticatedClient() {
  if (cachedAuth) return cachedAuth;

  const oAuth2Client = getOAuth2Client();

  if (!existsSync(TOKENS_PATH)) {
    throw new Error('No tokens found. Please run setup-auth.js first.');
  }

  const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
  oAuth2Client.setCredentials(tokens);

  // Auto-refresh tokens on expiry. F10: a thrown error inside this listener
  // would crash the process — log and set a flag instead.
  oAuth2Client.on('tokens', (newTokens) => {
    try {
      const current = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
      const merged = { ...current, ...newTokens };
      if (!merged.refresh_token) {
        reauthRequired = true;
        console.error('[gmail-mcp] Refresh token lost — please run setup-auth.js again');
        return;
      }
      writeTokensAtomic(merged);
    } catch (err) {
      reauthRequired = true;
      console.error('[gmail-mcp] Token refresh write failed:', err.message);
    }
  });

  cachedAuth = oAuth2Client;
  return oAuth2Client;
}

export function isReauthRequired() {
  return reauthRequired;
}

export function getGmailClient() {
  if (cachedGmail) return cachedGmail;
  const auth = getAuthenticatedClient();
  cachedGmail = google.gmail({ version: 'v1', auth });
  return cachedGmail;
}
