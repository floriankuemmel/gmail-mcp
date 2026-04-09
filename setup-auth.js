import { getOAuth2Client, SCOPES } from './auth.js';
import { writeFileSync, mkdirSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { createServer } from 'http';
import path from 'path';
import open from 'open';

const TOKENS_PATH = path.join(homedir(), 'credentials', 'gmail-mcp-credentials', 'tokens.json');

async function setup() {
  const oAuth2Client = getOAuth2Client();

  // Start a local server on a free port
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

  mkdirSync(path.join(homedir(), 'credentials', 'gmail-mcp-credentials'), { recursive: true });
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
  chmodSync(TOKENS_PATH, 0o600);

  console.log('✅ Authentication successful. Tokens saved at:', TOKENS_PATH);
}

setup().catch(console.error);
