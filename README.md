# Custom MCP Server

A Model Context Protocol (MCP) server that integrates with **Zoom**, **GitHub**, and **Google Sheets** APIs, enabling AI assistants to manage meetings, repositories, and spreadsheet data.

## Features

### Zoom Integration
- `zoom_list_meetings` - List all meetings for a user
- `zoom_get_meeting` - Get detailed meeting information
- `zoom_create_meeting` - Create new meetings
- `zoom_delete_meeting` - Delete meetings

### GitHub Integration
- `github_list_repos` - List repositories
- `github_get_repo` - Get repository details
- `github_list_issues` - List repository issues
- `github_create_issue` - Create new issues
- `github_create_pull_request` - Create pull requests
- Full repository management, branch operations, commits, files, and more

### Spreadsheet Integration (Semantic Matching)
- `spreadsheet_transfer_data` - Transfer data between spreadsheets using LLM-powered semantic matching
- `spreadsheet_preview_matching` - Preview matching without data transfer
- Supports any unique column type (cities, products, names, etc.)
- Confidence scoring and mismatch reporting
- Dry-run mode for safe testing

## Installation

### Prerequisites
- Node.js 18+
- Zoom API credentials (optional)
- GitHub Personal Access Token (optional)
- Google Sheets API Key (optional, for spreadsheet features)
- OpenAI API Key (optional, for spreadsheet semantic matching)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your credentials
```

## Configuration

Create a `.env` file with your API credentials:

```env
# Zoom OAuth 2.0 (Server-to-Server OAuth App)
# 1. Go to https://marketplace.zoom.us/develop/apps
# 2. Create "Server-to-Server OAuth" app
# 3. Copy Account ID, Client ID, and Client Secret
ZOOM_ACCOUNT_ID=your_zoom_account_id
ZOOM_CLIENT_ID=your_zoom_client_id
ZOOM_CLIENT_SECRET=your_zoom_client_secret

# GitHub Token (from https://github.com/settings/tokens)
GITHUB_TOKEN=your_github_token

# Google Sheets API Key
# 1. Go to https://console.cloud.google.com/
# 2. Enable Google Sheets API
# 3. Create API Key in Credentials
GOOGLE_SHEETS_API_KEY=your_google_sheets_api_key

# OpenAI API Key (for spreadsheet semantic matching)
# Get from https://platform.openai.com/api-keys
OPENAI_API_KEY=your_openai_api_key
```

See [SPREADSHEET_TOOL.md](./SPREADSHEET_TOOL.md) for detailed spreadsheet tool documentation.

## Usage

### Running the Server

Development mode:
```bash
npm run dev
```

Production:
```bash
npm run build
npm start
```

### OpenCode Integration

Add to your OpenCode configuration (`~/.opencode/config.json` or `opencode.jsonc`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "productivity-server": {
      "type": "local",
      "command": ["node", "/path/to/custom-mcp-server/build/index.js"],
      "enabled": true,
      "environment": {
        "ZOOM_ACCOUNT_ID": "your_zoom_account_id",
        "ZOOM_CLIENT_ID": "your_zoom_client_id",
        "ZOOM_CLIENT_SECRET": "your_zoom_client_secret",
        "GITHUB_TOKEN": "your_github_token",
        "GOOGLE_SHEETS_API_KEY": "your_google_sheets_api_key",
        "OPENAI_API_KEY": "your_openai_api_key"
      }
    }
  }
}
```

**Using with prompts:**

Once configured, you can reference the server in your prompts:

```
List my Zoom meetings using productivity-server
```

Or create GitHub issues:

```
Create a GitHub issue in my-repo about bug fix using productivity-server
```

**Enable/Disable tools:**

You can also enable or disable specific tools using wildcards in your config:

```json
{
  "mcp": {
    "productivity-server": { ... }
  },
  "tools": {
    "productivity-server_*": true
  }
}
```

## Project Structure

```
src/
├── index.ts              # Server entry point
├── config/               # Configuration
│   └── index.ts
├── providers/            # API clients
│   ├── zoom/
│   │   ├── client.ts
│   │   └── types.ts
│   ├── github/
│   │   ├── client.ts
│   │   └── types.ts
│   └── spreadsheet/
│       ├── google-client.ts   # Google Sheets API client
│       ├── matcher.ts         # Semantic matching with OpenAI
│       └── types.ts           # Spreadsheet types
├── tools/                # MCP tools
│   ├── zoom-tools.ts
│   ├── github-tools.ts
│   └── spreadsheet-tools.ts   # Spreadsheet transfer tools
└── utils/                # Utilities
    └── logger.ts
```

## API Documentation

### Zoom Tools

#### zoom_list_meetings
List all Zoom meetings for a user.

**Input:**
- `userId` (optional): User ID (default: current user)
- `pageSize` (optional): Results per page (1-300, default: 30)

**Output:** List of meetings with ID, topic, start time, duration, and join URL.

#### zoom_get_meeting
Get detailed information about a specific meeting.

**Input:**
- `meetingId` (required): The meeting ID

#### zoom_create_meeting
Create a new Zoom meeting.

**Input:**
- `topic` (required): Meeting title
- `type` (optional): 1=instant, 2=scheduled (default), 3=recurring_no_fixed, 8=recurring_fixed
- `startTime` (optional): ISO 8601 datetime
- `duration` (optional): Duration in minutes (default: 60)
- `timezone` (optional): Timezone (default: UTC)
- `password` (optional): Meeting password
- `agenda` (optional): Meeting description

#### zoom_delete_meeting
Delete a Zoom meeting.

**Input:**
- `meetingId` (required): The meeting ID to delete

### GitHub Tools

#### github_list_repos
List repositories for a user.

**Input:**
- `username` (optional): GitHub username (default: authenticated user)
- `page` (optional): Page number (default: 1)
- `perPage` (optional): Results per page (1-100, default: 30)

#### github_get_repo
Get repository details.

**Input:**
- `owner` (required): Repository owner
- `repo` (required): Repository name

#### github_list_issues
List repository issues.

**Input:**
- `owner` (required): Repository owner
- `repo` (required): Repository name
- `state` (optional): Filter by state - open, closed, all (default: open)
- `page` (optional): Page number (default: 1)
- `perPage` (optional): Issues per page (default: 30)

#### github_create_issue
Create a new issue.

**Input:**
- `owner` (required): Repository owner
- `repo` (required): Repository name
- `title` (required): Issue title
- `body` (optional): Issue description
- `labels` (optional): Array of label names
- `assignees` (optional): Array of usernames

#### github_create_pull_request
Create a new pull request.

**Input:**
- `owner` (required): Repository owner
- `repo` (required): Repository name
- `title` (required): PR title
- `head` (required): Branch with changes
- `base` (required): Target branch
- `body` (optional): PR description
- `draft` (optional): Create as draft (default: false)

### Spreadsheet Tools

#### spreadsheet_transfer_data
Transfer data between Google Sheets using LLM-powered semantic matching.

**Input:**
- `masterSpreadsheetUrl` (required): URL of master Google Spreadsheet
- `sourceSpreadsheetUrl` (required): URL of source Google Spreadsheet  
- `masterUniqueColumn` (required): Unique identifier column name in master
- `sourceUniqueColumn` (required): Unique identifier column name in source
- `valueColumns` (required): Array of column mappings to transfer
  - `sourceColumn`: Column name in source
  - `masterColumn`: Column name in master
  - `operation`: insert, update, sum, or average
- `options` (optional):
  - `dryRun`: Preview without updating (default: false)
  - `confidenceThreshold`: Minimum match confidence 0-1 (default: 0.8)
  - `matchModel`: OpenAI model (default: gpt-4o-mini)

**Example:**
```json
{
  "masterSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/MASTER_ID/edit",
  "sourceSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/SOURCE_ID/edit",
  "masterUniqueColumn": "Kota",
  "sourceUniqueColumn": "Nama Wilayah",
  "valueColumns": [
    {
      "sourceColumn": "Populasi 2024",
      "masterColumn": "Jumlah Penduduk",
      "operation": "update"
    }
  ],
  "options": {
    "dryRun": true,
    "confidenceThreshold": 0.8
  }
}
```

**Output:**
- Success status and dry-run flag
- Summary statistics (matched, unmatched, average confidence)
- Detailed mappings with confidence scores
- List of unmatched items with reasons
- Updated spreadsheet URL (if not dry-run)

#### spreadsheet_preview_matching
Preview semantic matching without performing data transfer.

**Input:**
- `masterSpreadsheetUrl` (required): URL of master spreadsheet
- `sourceSpreadsheetUrl` (required): URL of source spreadsheet
- `masterUniqueColumn` (required): Unique column in master
- `sourceUniqueColumn` (required): Unique column in source
- `matchModel` (optional): OpenAI model to use

**Output:**
- Sample of unique values from both spreadsheets
- Estimated match count and accuracy
- Sample matches with reasoning

**Use Case:** Validate matching approach before actual transfer.

See [SPREADSHEET_TOOL.md](./SPREADSHEET_TOOL.md) for detailed documentation and examples.

## License

MIT