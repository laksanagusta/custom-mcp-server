#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

// Start the MCP server
const serverPath = path.join(__dirname, 'build', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let buffer = '';

server.stdout.on('data', (data) => {
  buffer += data.toString();
  
  // Process complete JSON-RPC messages
  let lines = buffer.split('\n');
  buffer = lines.pop(); // Keep incomplete line in buffer
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        if (response.result) {
          console.log('=== TOOL RESULT ===');
          console.log(JSON.stringify(response.result, null, 2));
          server.kill();
          process.exit(0);
        }
        if (response.error) {
          console.error('Error:', response.error);
          server.kill();
          process.exit(1);
        }
      } catch (e) {
        // Not JSON, might be initialization message
        console.log('Server:', line);
      }
    }
  }
});

server.stderr.on('data', (data) => {
  console.error('Server Error:', data.toString());
});

// Initialize the MCP connection
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'mcp-client',
      version: '1.0.0'
    }
  }
};

// Tool call request
const toolRequest = {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'productivity-server_document_review',
    arguments: {
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/14GGNvD3eAk7eGd-qNUC48BADRCUJ-AJaHdEQAmzgpnA/edit?gid=0#gid=0',
      rootFolderUrl: 'https://drive.google.com/drive/folders/1smDj62TUHcKfdceXGSNYKB5bGFOEKSBx?usp=sharing',
      instructionColumn: 'B4',
      notesColumn: 'D4',
      targetFolderColumn: 'C4'
    }
  }
};

// Send requests after a short delay to allow server to start
setTimeout(() => {
  server.stdin.write(JSON.stringify(initRequest) + '\n');
  
  setTimeout(() => {
    server.stdin.write(JSON.stringify(toolRequest) + '\n');
  }, 1000);
}, 1000);

// Timeout after 60 seconds
setTimeout(() => {
  console.error('Timeout waiting for response');
  server.kill();
  process.exit(1);
}, 60000);
