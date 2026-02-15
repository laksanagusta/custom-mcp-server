import { google, sheets_v4, Auth } from 'googleapis';
import { config } from '../../config/index.js';
import { mcpLogger as logger } from '../../utils/logger.js';
import { SheetData, SpreadsheetRow } from './types.js';

export class GoogleSheetsClient {
  private sheets: sheets_v4.Sheets;
  private oauth2Client: Auth.OAuth2Client | null = null;

  constructor() {
    this.sheets = google.sheets({
      version: 'v4',
      auth: config.googleSheets.apiKey
    });

    // Initialize OAuth2 client if credentials are available
    if (config.googleSheets.clientId && config.googleSheets.clientSecret && config.googleSheets.redirectUri) {
      this.oauth2Client = new google.auth.OAuth2(
        config.googleSheets.clientId,
        config.googleSheets.clientSecret,
        config.googleSheets.redirectUri
      );

      // Set credentials if available
      if (config.googleSheets.accessToken && config.googleSheets.refreshToken) {
        this.oauth2Client.setCredentials({
          access_token: config.googleSheets.accessToken,
          refresh_token: config.googleSheets.refreshToken
        });
      }
    }
  }

  /**
   * Check if OAuth is configured and available
   */
  isOAuthConfigured(): boolean {
    return !!this.oauth2Client;
  }

  /**
   * Check if authenticated with OAuth
   */
  isAuthenticated(): boolean {
    return !!this.oauth2Client && !!config.googleSheets.accessToken;
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthUrl(): string | null {
    if (!this.oauth2Client) {
      logger.error('OAuth not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI');
      return null;
    }

    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly'
    ];

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      include_granted_scopes: true,
      prompt: 'consent'
    });

    logger.info('Generated OAuth URL', { url: authUrl });
    return authUrl;
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (!this.oauth2Client) {
      throw new Error('OAuth not configured');
    }

    try {
      logger.info('Exchanging code for tokens');
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error('No access token received');
      }

      // Set credentials on the client
      this.oauth2Client.setCredentials(tokens);

      logger.info('Successfully obtained OAuth tokens', {
        hasRefreshToken: !!tokens.refresh_token
      });

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || ''
      };
    } catch (error) {
      logger.error('Error exchanging code for tokens', { error });
      throw new Error(`Failed to exchange code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get authenticated sheets client for write operations
   */
  private getAuthenticatedSheets(): sheets_v4.Sheets {
    if (!this.oauth2Client || !this.isAuthenticated()) {
      throw new Error('Not authenticated with OAuth. Please authenticate first using getAuthUrl() and handleCallback()');
    }

    return google.sheets({
      version: 'v4',
      auth: this.oauth2Client
    });
  }

  /**
   * Extract spreadsheet ID from Google Sheets URL
   */
  extractSpreadsheetId(url: string): string {
    // Handle various Google Sheets URL formats
    const patterns = [
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
      /\/spreadsheets\/edit\?.*id=([a-zA-Z0-9-_]+)/,
      /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    throw new Error(`Invalid Google Sheets URL: ${url}`);
  }

  /**
   * Read specific column data by coordinate (e.g., "D", "AA", "A2", "B5")
   * If coordinate includes row (e.g., "D4"), reads from that row onwards
   * If coordinate is just column (e.g., "D"), reads from row 1 onwards
   * 
   * Returns object with:
   * - values: array of string values
   * - startRow: the actual spreadsheet row number where reading started (1-based)
   */
  async readColumnByCoordinate(url: string, columnCoordinate: string): Promise<{ values: string[]; startRow: number }> {
    try {
      const spreadsheetId = this.extractSpreadsheetId(url);
      
      // Parse coordinate to get column and optional start row
      const cellRef = this.parseCellCoordinate(columnCoordinate);
      const column = cellRef ? cellRef.column : columnCoordinate.toUpperCase().trim();
      // If user specifies D4, start from row 4. If just D, start from row 1.
      const startRow = cellRef ? cellRef.row : 1;
      
      // Get spreadsheet metadata to find first sheet
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId,
        key: config.googleSheets.apiKey
      });

      const sheetName = spreadsheet.data.sheets?.[0]?.properties?.title || 'Sheet1';
      
      logger.info('Reading column by coordinate', { 
        spreadsheetId, 
        column, 
        startRow,
        originalInput: columnCoordinate 
      });

      // Build range: e.g., "Sheet1!D4:D"
      const range = `${sheetName}!${column}${startRow}:${column}`;

      // Get specific column values
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        key: config.googleSheets.apiKey
      });

      const values = response.data.values;
      if (!values || values.length === 0) {
        return { values: [], startRow };
      }

      // Flatten array - keep empty strings for alignment
      return {
        values: values.map(row => row[0] !== undefined ? String(row[0]) : ''),
        startRow
      };
    } catch (error) {
      logger.error('Error reading column by coordinate', { error, url, column: columnCoordinate });
      throw new Error(`Failed to read column ${columnCoordinate}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Read spreadsheet data (uses API key - no OAuth needed)
   */
  async readSpreadsheet(url: string): Promise<SheetData> {
    try {
      const spreadsheetId = this.extractSpreadsheetId(url);
      logger.info('Reading spreadsheet', { spreadsheetId });

      // Get spreadsheet metadata to find the first sheet
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId,
        key: config.googleSheets.apiKey
      });

      const sheetName = spreadsheet.data.sheets?.[0]?.properties?.title || 'Sheet1';

      // Get all values from the sheet
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: sheetName,
        key: config.googleSheets.apiKey
      });

      const values = response.data.values;
      if (!values || values.length === 0) {
        throw new Error('Spreadsheet is empty');
      }

      // Find the actual header row - skip rows that look like error messages or are empty
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(values.length, 10); i++) {
        const row = values[i];
        // Check if this row has content that looks like headers (not error messages)
        if (row && row.length > 0) {
          const firstCell = String(row[0] || '').toUpperCase();
          // Skip rows with error messages
          if (!firstCell.includes('MOHON') && !firstCell.includes('ERROR') && !firstCell.includes('PERBAIKAN')) {
            headerRowIndex = i;
            break;
          }
        }
      }

      // Use the found header row
      const headers = values[headerRowIndex];
      const dataRows = values.slice(headerRowIndex + 1);

      logger.info('Using header row', { headerRowIndex, headerCount: headers.length });

      // Convert to row objects
      const rows: SpreadsheetRow[] = dataRows.map((row, index) => {
        const rowObj: SpreadsheetRow = {};
        headers.forEach((header, colIndex) => {
          const value = row[colIndex];
          // Try to parse as number, otherwise keep as string
          if (value !== undefined && value !== null && value !== '') {
            const numValue = Number(value);
            rowObj[header] = isNaN(numValue) ? value : numValue;
          } else {
            rowObj[header] = null;
          }
        });
        return rowObj;
      });

      logger.info('Spreadsheet read successfully', {
        spreadsheetId,
        rows: rows.length,
        columns: headers.length
      });

      return {
        spreadsheetId,
        sheetName,
        headers,
        rows,
        headerRowIndex
      };
    } catch (error) {
      logger.error('Error reading spreadsheet', { error, url });
      throw new Error(`Failed to read spreadsheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Write data to spreadsheet (update existing rows) - Requires OAuth
   * 
   * @param updates - Array of updates. Each update.rowIndex can be:
   *   - A 0-based index (when baseRowIndex is set to the actual start row)
   *   - An ACTUAL spreadsheet row number (when baseRowIndex is set to 0)
   * @param baseRowIndex - The row number to add to each rowIndex:
   *   - If updates use 0-based indices: set to the actual start row number
   *   - If updates use actual row numbers: set to 0
   *   Final row = baseRowIndex + rowIndex
   */
  async updateSpreadsheet(
    url: string,
    sheetData: SheetData,
    updates: Array<{ rowIndex: number; columnName: string; value: string | number | null }>,
    baseRowIndex: number = 1  // Set to 0 if rowIndex is already the actual spreadsheet row number
  ): Promise<void> {
    try {
      const spreadsheetId = this.extractSpreadsheetId(url);
      const { sheetName, headers } = sheetData;

      // Use authenticated sheets client for write operations
      const authSheets = this.getAuthenticatedSheets();

      logger.info('Updating spreadsheet', {
        spreadsheetId,
        updateCount: updates.length
      });

      // Group updates by row
      const updatesByRow = new Map<number, Map<number, string | number | null>>();
      
      for (const update of updates) {
        let colIndex: number;
        
        // Check if columnName is a coordinate (e.g., "D", "AA", "S5")
        if (this.isCoordinate(update.columnName)) {
          // Extract just the column letter
          colIndex = this.columnToIndex(this.extractColumnFromCoordinate(update.columnName));
        } else {
          // Look up by header name
          colIndex = headers.indexOf(update.columnName);
          if (colIndex === -1) {
            // Try case-insensitive match
            const lowerColumnName = update.columnName.toLowerCase();
            colIndex = headers.findIndex(h => h.toLowerCase() === lowerColumnName);
          }
        }
        
        if (colIndex === -1) {
          logger.warn(`Column not found: ${update.columnName}`);
          continue;
        }

        if (!updatesByRow.has(update.rowIndex)) {
          updatesByRow.set(update.rowIndex, new Map());
        }
        updatesByRow.get(update.rowIndex)!.set(colIndex, update.value);
      }

      // Build batch update request
      const data: sheets_v4.Schema$ValueRange[] = [];
      
      for (const [rowIndex, colUpdates] of updatesByRow) {
        // Convert 0-based index to 1-based spreadsheet row number
        // baseRowIndex is the row number that corresponds to rowIndex 0
        const apiRowIndex = baseRowIndex + rowIndex;
        
        // Find the range of columns to update
        const colIndices = Array.from(colUpdates.keys()).sort((a, b) => a - b);
        const minCol = colIndices[0];
        const maxCol = colIndices[colIndices.length - 1];
        
        // Build row values array
        const rowValues: (string | number | null)[] = [];
        for (let i = minCol; i <= maxCol; i++) {
          rowValues.push(colUpdates.get(i) ?? '');
        }
        
        const startCol = this.columnIndexToLetter(minCol);
        const endCol = this.columnIndexToLetter(maxCol);
        
        data.push({
          range: `${sheetName}!${startCol}${apiRowIndex}:${endCol}${apiRowIndex}`,
          values: [rowValues]
        });
      }

      if (data.length === 0) {
        logger.info('No updates to apply');
        return;
      }

      // Execute batch update using authenticated client
      await authSheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data
        }
      });

      logger.info('Spreadsheet updated successfully', {
        spreadsheetId,
        updatedRows: data.length
      });
    } catch (error) {
      logger.error('Error updating spreadsheet', { error, url });
      throw new Error(`Failed to update spreadsheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert column index to letter (0 -> A, 1 -> B, etc.)
   */
  private columnIndexToLetter(index: number): string {
    let result = '';
    let i = index;

    do {
      result = String.fromCharCode(65 + (i % 26)) + result;
      i = Math.floor(i / 26) - 1;
    } while (i >= 0);

    return result;
  }

  /**
   * Parse cell coordinate in format "A2", "B3", "AA10", etc.
   * Returns { column: "A", row: 2 } or null if invalid
   * Row is 1-based (e.g., A2 means row 2)
   */
  parseCellCoordinate(cellRef: string): { column: string; row: number } | null {
    if (!cellRef) return null;
    const trimmed = cellRef.trim().toUpperCase();
    
    // Match pattern: letters followed by numbers (e.g., A2, AA10, B3)
    const match = trimmed.match(/^([A-Z]{1,3})(\d+)$/);
    if (!match) return null;
    
    const column = match[1];
    const row = parseInt(match[2], 10);
    
    if (row < 1) return null;
    
    return { column, row };
  }

  /**
   * Check if a string is a column coordinate (e.g., "A", "B", "AA", "AB", "ZZZ")
   * or cell coordinate (e.g., "A2", "B3")
   * Case-insensitive. Valid coordinates are 1-3 letters (A-ZZZ)
   */
  isCoordinate(column: string): boolean {
    if (!column || column.length === 0) return false;
    const upperColumn = column.toUpperCase().trim();
    
    // Check if it's a cell coordinate (A2, B3, etc.)
    if (this.parseCellCoordinate(upperColumn)) return true;
    
    // Check if it's just a column letter (A, B, AA, etc.)
    if (upperColumn.length > 3) return false;
    return /^[A-Z]{1,3}$/.test(upperColumn);
  }

  /**
   * Extract column letter from coordinate (supports both "A" and "A2" formats)
   */
  extractColumnFromCoordinate(coordinate: string): string {
    const cellRef = this.parseCellCoordinate(coordinate);
    if (cellRef) return cellRef.column;
    
    // If it's just a column letter, return as-is
    const upper = coordinate.toUpperCase().trim();
    if (/^[A-Z]{1,3}$/.test(upper)) return upper;
    
    throw new Error(`Invalid coordinate format: ${coordinate}`);
  }

  /**
   * Extract row number from coordinate (returns 1 if just column letter like "A")
   */
  extractRowFromCoordinate(coordinate: string): number {
    const cellRef = this.parseCellCoordinate(coordinate);
    if (cellRef) return cellRef.row;
    
    // If it's just a column letter, assume row 1
    const upper = coordinate.toUpperCase().trim();
    if (/^[A-Z]{1,3}$/.test(upper)) return 1;
    
    throw new Error(`Invalid coordinate format: ${coordinate}`);
  }

  /**
   * Convert column letter to index (A -> 0, B -> 1, AA -> 26)
   * Case-insensitive
   */
  columnToIndex(column: string): number {
    const upperColumn = column.toUpperCase();
    let result = 0;
    for (let i = 0; i < upperColumn.length; i++) {
      result = result * 26 + (upperColumn.charCodeAt(i) - 64);
    }
    return result - 1; // Convert to 0-based index
  }

  /**
   * Convert index to column letter (0 -> A, 1 -> B, 26 -> AA)
   */
  indexToColumn(index: number): string {
    return this.columnIndexToLetter(index);
  }

  /**
   * Resolve column identifier to header name
   * If identifier is a coordinate (A, B, AA), convert to header name
   * If identifier is a name, return as-is (case-insensitive matching)
   * Returns null if not found
   */
  resolveColumnIdentifier(columnId: string, headers: string[]): string | null {
    if (!columnId) return null;

    // Check if it's a coordinate
    if (this.isCoordinate(columnId)) {
      const index = this.columnToIndex(columnId);
      if (index >= 0 && index < headers.length) {
        return headers[index];
      }
      return null;
    }

    // It's a name - do case-insensitive matching
    const lowerColumnId = columnId.toLowerCase();
    const matchedHeader = headers.find(h => h.toLowerCase() === lowerColumnId);
    return matchedHeader || null;
  }

  /**
   * Validate that a column identifier exists in the spreadsheet
   * Throws error if not found with helpful message
   */
  validateColumnExists(columnId: string, headers: string[], context: string): void {
    const resolved = this.resolveColumnIdentifier(columnId, headers);

    if (resolved === null) {
      if (this.isCoordinate(columnId)) {
        const index = this.columnToIndex(columnId);
        throw new Error(
          `${context} column '${columnId}' (index ${index}) not found. ` +
          `Spreadsheet only has ${headers.length} columns (A-${this.indexToColumn(headers.length - 1)}). ` +
          `Available headers: ${headers.join(', ')}`
        );
      } else {
        throw new Error(
          `${context} column '${columnId}' not found. ` +
          `Available headers: ${headers.join(', ')}`
        );
      }
    }
  }

  /**
   * Resolve column identifier to header name (throws if not found)
   */
  getColumnHeader(columnId: string, headers: string[]): string {
    const resolved = this.resolveColumnIdentifier(columnId, headers);
    if (resolved === null) {
      throw new Error(`Column '${columnId}' not found in headers: ${headers.join(', ')}`);
    }
    return resolved;
  }
}

// Export singleton instance
export const googleSheetsClient = new GoogleSheetsClient();
