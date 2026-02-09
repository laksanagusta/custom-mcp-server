import { GoogleSheetsClient } from '../providers/spreadsheet/google-client.js';
import { config } from '../config/index.js';
import http from 'http';
import url from 'url';

const googleSheetsClient = new GoogleSheetsClient();

console.log('\n🔐 Google Sheets OAuth Authentication\n');

// Check if OAuth is configured
if (!googleSheetsClient.isOAuthConfigured()) {
  console.error('❌ OAuth not configured!');
  console.error('\nPlease set these environment variables:');
  console.error('  - GOOGLE_CLIENT_ID');
  console.error('  - GOOGLE_CLIENT_SECRET');
  console.error('  - GOOGLE_REDIRECT_URI (e.g., http://localhost:3000/oauth/callback)');
  console.error('\nThen run this command again.\n');
  process.exit(1);
}

// Generate auth URL
const authUrl = googleSheetsClient.getAuthUrl();

if (!authUrl) {
  console.error('❌ Failed to generate authentication URL');
  process.exit(1);
}

console.log('✅ OAuth is configured!\n');
console.log('🔗 Please visit this URL to authenticate:');
console.log('\x1b[36m%s\x1b[0m', authUrl);
console.log('\n');

// Parse redirect URI to get port and path
const redirectUri = config.googleSheets.redirectUri;
if (!redirectUri) {
  console.error('❌ GOOGLE_REDIRECT_URI not set');
  process.exit(1);
}

const parsedUrl = new URL(redirectUri);
const port = parseInt(parsedUrl.port) || 3000;
const callbackPath = parsedUrl.pathname;

console.log(`🚀 Starting local server on port ${port} to handle callback...`);
console.log(`   Waiting for callback at: ${redirectUri}\n`);

// Create HTTP server to handle OAuth callback
const server = http.createServer(async (req, res) => {
  const parsedReqUrl = url.parse(req.url || '', true);
  
  if (parsedReqUrl.pathname === callbackPath) {
    const code = parsedReqUrl.query.code as string;
    const error = parsedReqUrl.query.error as string;
    
    if (error) {
      console.error(`\n❌ OAuth error: ${error}`);
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #d32f2f;">❌ Authentication Failed</h1>
            <p>Error: ${error}</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);
      server.close();
      process.exit(1);
    }
    
    if (code) {
      console.log('\n📨 Received authorization code!\n');
      
      try {
        const tokens = await googleSheetsClient.handleCallback(code);
        
        console.log('✅ Authentication successful!\n');
        console.log('🔑 Tokens received:');
        console.log(`   Access Token: ${tokens.accessToken.substring(0, 20)}...`);
        console.log(`   Refresh Token: ${tokens.refreshToken ? tokens.refreshToken.substring(0, 20) + '...' : 'Not provided'}\n`);
        
        console.log('📋 Add these to your environment variables:');
        console.log('\x1b[32m%s\x1b[0m', `   GOOGLE_ACCESS_TOKEN=${tokens.accessToken}`);
        if (tokens.refreshToken) {
          console.log('\x1b[32m%s\x1b[0m', `   GOOGLE_REFRESH_TOKEN=${tokens.refreshToken}`);
        }
        console.log('\n');
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #4caf50;">✅ Authentication Successful!</h1>
              <p>You can now close this window and return to your terminal.</p>
              <p>Tokens have been printed in the console.</p>
            </body>
          </html>
        `);
        
        server.close();
        process.exit(0);
      } catch (err) {
        console.error('\n❌ Failed to exchange code for tokens:', err);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #d32f2f;">❌ Authentication Failed</h1>
              <p>Failed to exchange code for tokens.</p>
              <p>You can close this window.</p>
            </body>
          </html>
        `);
        server.close();
        process.exit(1);
      }
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(port, () => {
  console.log(`✅ Server listening on http://localhost:${port}`);
  console.log('   Waiting for Google callback...\n');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  server.close();
  process.exit(0);
});
