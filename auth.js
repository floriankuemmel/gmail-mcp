import { google } from 'googleapis';
import { execFileSync } from 'child_process';
import { platform } from 'os';

const KEYCHAIN_SERVICE = 'gmail-mcp';
const VALID_ACCOUNTS = new Set(['credentials', 'tokens']);

export const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

// Singleton: cached OAuth2 client and Gmail client.
// Avoids race conditions on concurrent token refreshes
// and prevents an unnecessary disk read on every API call.
let cachedAuth = null;
let cachedGmail = null;
let reauthRequired = false;

// --- macOS Keychain helpers ---
// Uses execFileSync (no shell) to prevent command injection.

function assertMacOS() {
  if (platform() !== 'darwin') {
    throw new Error('This server requires macOS (uses the macOS Keychain for credential storage).');
  }
}

function assertValidAccount(account) {
  if (!VALID_ACCOUNTS.has(account)) {
    throw new Error(`Invalid Keychain account name: ${account}`);
  }
}

export function keychainRead(account) {
  assertMacOS();
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
  assertMacOS();
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

export function getOAuth2Client() {
  const credentials = keychainRead('credentials');
  if (!credentials) {
    throw new Error('No credentials found in macOS Keychain. Please run: npm run setup');
  }
  // Google Cloud Console produces either "installed" or "web" depending on client type
  const config = credentials.installed || credentials.web;
  if (!config) {
    throw new Error('Stored credentials have unknown format. Expected "installed" or "web" key.');
  }
  const { client_secret, client_id, redirect_uris } = config;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

export function getAuthenticatedClient() {
  if (cachedAuth) return cachedAuth;

  const oAuth2Client = getOAuth2Client();
  const tokens = keychainRead('tokens');
  if (!tokens) {
    throw new Error('No tokens found in macOS Keychain. Please run: npm run setup');
  }
  oAuth2Client.setCredentials(tokens);

  // Auto-refresh tokens on expiry. F10: a thrown error inside this listener
  // would crash the process -- log and set a flag instead.
  oAuth2Client.on('tokens', (newTokens) => {
    try {
      const current = keychainRead('tokens') || {};
      const merged = { ...current, ...newTokens };
      if (!merged.refresh_token) {
        reauthRequired = true;
        console.error('[gmail-mcp] Refresh token lost -- please run setup-auth.js again');
        return;
      }
      if (!keychainWrite('tokens', merged)) {
        reauthRequired = true;
        console.error('[gmail-mcp] Token refresh write to Keychain failed');
      }
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
