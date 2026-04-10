import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync, chmodSync, renameSync } from 'fs';
import { execFileSync } from 'child_process';
import { homedir, platform } from 'os';
import path from 'path';

// Legacy file paths (fallback when Keychain is unavailable)
const CREDENTIALS_PATH = path.join(homedir(), 'credentials', 'gmail-mcp-credentials', 'credentials.json');
const TOKENS_PATH = path.join(homedir(), 'credentials', 'gmail-mcp-credentials', 'tokens.json');

const KEYCHAIN_SERVICE = 'gmail-mcp';
const VALID_ACCOUNTS = new Set(['credentials', 'tokens']);
const IS_MACOS = platform() === 'darwin';

export const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

// Singleton: cached OAuth2 client and Gmail client.
// Avoids race conditions on concurrent token refreshes
// and prevents an unnecessary disk read on every API call.
let cachedAuth = null;
let cachedGmail = null;
let reauthRequired = false;

// --- macOS Keychain helpers ---
// Uses execFileSync (no shell) to prevent command injection.

function assertValidAccount(account) {
  if (!VALID_ACCOUNTS.has(account)) {
    throw new Error(`Invalid Keychain account name: ${account}`);
  }
}

export function keychainRead(account) {
  if (!IS_MACOS) return null;
  assertValidAccount(account);
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function keychainWrite(account, data) {
  if (!IS_MACOS) return false;
  assertValidAccount(account);
  const json = JSON.stringify(data);
  try {
    // Delete existing entry first (add-generic-password -U only updates the password
    // field but can fail if the entry doesn't exist yet on some macOS versions)
    try {
      execFileSync(
        'security',
        ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } catch { /* entry didn't exist, that's fine */ }
    execFileSync(
      'security',
      ['add-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w', json],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return true;
  } catch (err) {
    console.error('[gmail-mcp] Keychain write failed:', err.message);
    return false;
  }
}

function loadCredentials() {
  // Try Keychain first
  const kc = keychainRead('credentials');
  if (kc) return kc;
  // Fall back to file
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      IS_MACOS
        ? 'No credentials found. Please run: npm run setup'
        : `No credentials found at ${CREDENTIALS_PATH}. Please run: npm run setup`
    );
  }
  const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
  try { chmodSync(CREDENTIALS_PATH, 0o600); } catch { /* best-effort */ }
  return credentials;
}

function loadTokens() {
  // Try Keychain first
  const kc = keychainRead('tokens');
  if (kc) return kc;
  // Fall back to file
  if (!existsSync(TOKENS_PATH)) {
    throw new Error('No tokens found. Please run: npm run setup');
  }
  return JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
}

function saveTokens(tokens) {
  // Try Keychain first
  if (keychainWrite('tokens', tokens)) return;
  // Fall back to atomic file write
  writeTokensAtomic(tokens);
}

export function getOAuth2Client() {
  const credentials = loadCredentials();
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
  const tokens = loadTokens();
  oAuth2Client.setCredentials(tokens);

  // Auto-refresh tokens on expiry. F10: a thrown error inside this listener
  // would crash the process -- log and set a flag instead.
  oAuth2Client.on('tokens', (newTokens) => {
    try {
      const current = loadTokens();
      const merged = { ...current, ...newTokens };
      if (!merged.refresh_token) {
        reauthRequired = true;
        console.error('[gmail-mcp] Refresh token lost -- please run setup-auth.js again');
        return;
      }
      saveTokens(merged);
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
