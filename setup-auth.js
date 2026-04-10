import { getOAuth2Client, SCOPES, keychainRead, keychainWrite } from './auth.js';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { createServer } from 'http';
import path from 'path';
import open from 'open';

// Legacy file path (for migration from older versions)
const LEGACY_CREDENTIALS_PATH = path.join(homedir(), 'credentials', 'gmail-mcp-credentials', 'credentials.json');

// Try to find a client_secret_*.json in ~/Downloads/
function findClientSecretInDownloads() {
  const downloadsDir = path.join(homedir(), 'Downloads');
  try {
    const files = readdirSync(downloadsDir);
    const match = files.find(f =>
      f.startsWith('client_secret_') && f.endsWith('.apps.googleusercontent.com.json')
    );
    if (match) return path.join(downloadsDir, match);
  } catch { /* Downloads folder not readable */ }
  return null;
}

function importCredentials() {
  // Already in Keychain?
  if (keychainRead('credentials')) {
    console.log('Credentials found in macOS Keychain.');
    return;
  }
  // Migration: check legacy file location
  if (existsSync(LEGACY_CREDENTIALS_PATH)) {
    console.log('Credentials found at legacy location:', LEGACY_CREDENTIALS_PATH);
    const data = JSON.parse(readFileSync(LEGACY_CREDENTIALS_PATH, 'utf8'));
    if (keychainWrite('credentials', data)) {
      console.log('Credentials migrated to macOS Keychain.');
      console.log('You can now delete:', LEGACY_CREDENTIALS_PATH);
    } else {
      throw new Error('Failed to write credentials to macOS Keychain.');
    }
    return;
  }
  // Try ~/Downloads/
  const downloadedFile = findClientSecretInDownloads();
  if (downloadedFile) {
    console.log('Found credentials in Downloads:', path.basename(downloadedFile));
    const data = JSON.parse(readFileSync(downloadedFile, 'utf8'));
    const config = data.installed || data.web;
    if (!config) {
      throw new Error('Downloaded file has unknown format. Expected "installed" or "web" key.');
    }
    if (keychainWrite('credentials', data)) {
      console.log('Credentials stored in macOS Keychain.');
      console.log('You can now delete the downloaded file:', downloadedFile);
    } else {
      throw new Error('Failed to write credentials to macOS Keychain.');
    }
    return;
  }
  throw new Error(
    'No credentials found.\n\n' +
    'Please download your OAuth client credentials from Google Cloud Console\n' +
    '(APIs & Services > Credentials > your Desktop client > Download JSON)\n' +
    'and place the file in your ~/Downloads/ folder.\n\n' +
    'Then run this command again: npm run setup'
  );
}

async function setup() {
  // Step 1: Find or import credentials
  importCredentials();

  // Step 2: Create OAuth2 client (reads from Keychain)
  const oAuth2Client = getOAuth2Client();

  // Step 3: Start a local server on a free port
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}`;

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    redirect_uri: redirectUri
  });

  console.log('Opening browser for Google authorization...');
  await open(authUrl);

  // Wait for the OAuth callback
  const code = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const authCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Authorization denied</h1><p>You can close this window.</p>');
        server.close();
        reject(new Error(`Google denied authorization: ${error}`));
        return;
      }

      if (authCode) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Authentication successful!</h1><p>You can close this window.</p>');
        server.close();
        resolve(authCode);
      }
    });

    // Time out after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Timeout: no response within 2 minutes.'));
    }, 120000);
  });

  const { tokens } = await oAuth2Client.getToken({ code, redirect_uri: redirectUri });

  if (!tokens.refresh_token) {
    throw new Error('No refresh token received. Please run setup-auth.js again.');
  }

  // Step 4: Save tokens to Keychain
  if (keychainWrite('tokens', tokens)) {
    console.log('Tokens stored in macOS Keychain.');
  } else {
    throw new Error('Failed to write tokens to macOS Keychain.');
  }

  console.log('\nSetup complete. You can now use the Gmail MCP server.');
}

setup().catch(console.error);
