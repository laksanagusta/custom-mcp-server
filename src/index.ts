#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express, { Request, Response } from 'express';
import { zoomTools } from './tools/zoom-tools.js';
import { githubTools } from './tools/github-tools.js';
import { spreadsheetTools } from './tools/spreadsheet-tools.js';
import { documentReviewTools } from './tools/document-review-tools.js';
import { geminiFileSearchTools } from './tools/gemini-file-search-tools.js';
import { mcpLogger as logger } from './utils/logger.js';
import { googleSheetsClient } from './providers/spreadsheet/google-client.js';

const SERVER_NAME = 'productivity-mcp-server';
const SERVER_VERSION = '1.0.0';

async function main() {
  try {
    logger.info(`Starting ${SERVER_NAME} v${SERVER_VERSION}...`);

    // Start HTTP server for OAuth callback
    startOAuthServer();

    // Create MCP server instance
    const server = new McpServer({
      name: SERVER_NAME,
      version: SERVER_VERSION,
    });

    // Register all tools
    const allTools = { ...zoomTools, ...githubTools, ...spreadsheetTools, ...documentReviewTools, ...geminiFileSearchTools };

    for (const [toolName, toolDef] of Object.entries(allTools)) {
      const toolConfig: Record<string, unknown> = {
        title: toolName,
        description: toolDef.description,
        inputSchema: toolDef.inputSchema,
      };
      if ('outputSchema' in toolDef && toolDef.outputSchema) {
        toolConfig.outputSchema = toolDef.outputSchema;
      }
      server.registerTool(
        toolName,
        toolConfig as any,
        toolDef.handler as any
      );
    }

    logger.info(`Registered ${Object.keys(allTools).length} tools`);

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Connect server to transport
    await server.connect(transport);

    logger.info(`${SERVER_NAME} is running on stdio transport`);
    logger.info('Available tools:');
    
    // Log Zoom tools
    const zoomToolNames = Object.keys(zoomTools);
    logger.info(`  Zoom tools (${zoomToolNames.length}): ${zoomToolNames.join(', ')}`);
    
    // Log GitHub tools
    const githubToolNames = Object.keys(githubTools);
    logger.info(`  GitHub tools (${githubToolNames.length}): ${githubToolNames.join(', ')}`);
    
    // Log Spreadsheet tools
    const spreadsheetToolNames = Object.keys(spreadsheetTools);
    logger.info(`  Spreadsheet tools (${spreadsheetToolNames.length}): ${spreadsheetToolNames.join(', ')}`);
    
    // Log Document Review tools
    const docReviewToolNames = Object.keys(documentReviewTools);
    logger.info(`  Document Review tools (${docReviewToolNames.length}): ${docReviewToolNames.join(', ')}`);
    
    // Log Gemini File Search tools
    const geminiToolNames = Object.keys(geminiFileSearchTools);
    logger.info(`  Gemini File Search tools (${geminiToolNames.length}): ${geminiToolNames.join(', ')}`);
    // Check if OAuth is configured
    if (googleSheetsClient.isOAuthConfigured()) {
      if (googleSheetsClient.isAuthenticated()) {
        logger.info('✓ Google OAuth: Configured and authenticated');
      } else {
        const authUrl = googleSheetsClient.getAuthUrl();
        if (authUrl) {
          logger.info('⚠ Google OAuth: Configured but not authenticated');
          logger.info(`  Please visit: ${authUrl}`);
        }
      }
    } else {
      logger.info('✗ Google OAuth: Not configured (write operations unavailable)');
    }

  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

function startOAuthServer() {
  const app = express();
  const port = 3000;

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', service: SERVER_NAME });
  });

  // OAuth callback endpoint
  app.get('/auth/google/callback', async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const error = req.query.error as string;

    if (error) {
      logger.error('OAuth error from Google', { error });
      res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1 style="color: #d32f2f;">❌ Authentication Failed</h1>
            <p>Error: ${error}</p>
            <p>Please try again.</p>
          </body>
        </html>
      `);
      return;
    }

    if (!code) {
      res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1 style="color: #d32f2f;">❌ Invalid Request</h1>
            <p>No authorization code received.</p>
          </body>
        </html>
      `);
      return;
    }

    try {
      const tokens = await googleSheetsClient.handleCallback(code);
      
      logger.info('OAuth authentication successful', {
        hasAccessToken: !!tokens.accessToken,
        hasRefreshToken: !!tokens.refreshToken
      });

      // Display success message with instructions
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1 style="color: #2e7d32;">✅ Authentication Successful!</h1>
            <p>You have successfully authenticated with Google Sheets.</p>
            
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3>Add these environment variables to your .env file:</h3>
              <pre style="background: #263238; color: #aed581; padding: 15px; border-radius: 5px; overflow-x: auto;">
GOOGLE_ACCESS_TOKEN=${tokens.accessToken}
GOOGLE_REFRESH_TOKEN=${tokens.refreshToken}</pre>
            </div>
            
            <p><strong>Important:</strong> Copy these values and add them to your .env file, then restart the server.</p>
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              You can close this window now.
            </p>
          </body>
        </html>
      `);
    } catch (err) {
      logger.error('OAuth callback error', { error: err });
      res.status(500).send(`
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1 style="color: #d32f2f;">❌ Authentication Failed</h1>
            <p>Error: ${err instanceof Error ? err.message : 'Unknown error'}</p>
            <p>Please check the server logs and try again.</p>
          </body>
        </html>
      `);
    }
  });

  // Start HTTP server
  app.listen(port, () => {
    logger.info(`OAuth callback server listening on http://localhost:${port}`);
    logger.info(`  Callback URL: http://localhost:${port}/auth/google/callback`);
  });
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
main();
