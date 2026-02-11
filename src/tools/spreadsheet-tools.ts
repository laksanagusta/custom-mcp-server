import { z } from 'zod';
import { GoogleSheetsClient } from '../providers/spreadsheet/google-client.js';
import { SemanticMatcher } from '../providers/spreadsheet/matcher.js';
import { mcpLogger as logger } from '../utils/logger.js';
import {
  ValueColumnMapping,
  TransferOptions,
  TransferResult,
  MatchResult,
  UnmatchedItem,
  SpreadsheetRow
} from '../providers/spreadsheet/types.js';

const googleSheetsClient = new GoogleSheetsClient();
const semanticMatcher = new SemanticMatcher();

// Helper function to format result as MCP content with structured output
function formatResult(data: Record<string, unknown>) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(data, null, 2)
    }],
    structuredContent: data
  };
}

// Input schemas
const ValueColumnMappingSchema = z.object({
  sourceColumn: z.string().describe('Column in source spreadsheet (can be column letter like "A", "B", "AA", cell coordinate like "A2", "B3", or header name)'),
  masterColumn: z.string().describe('Column in master spreadsheet (can be column letter like "A", "B", "AA", cell coordinate like "A2", "B3", or header name)'),
  operation: z.enum(['insert', 'update', 'sum', 'average'])
    .optional()
    .default('update')
    .describe('Operation to perform: insert, update, sum, or average')
});

const TransferOptionsSchema = z.object({
  dryRun: z.boolean()
    .optional()
    .default(false)
    .describe('Preview only - do not actually update the spreadsheet'),
  confidenceThreshold: z.number()
    .min(0)
    .max(1)
    .optional()
    .default(0.8)
    .describe('Minimum confidence score for matches (0-1)'),
  matchModel: z.string()
    .optional()
    .default('gpt-4o-mini')
    .describe('OpenAI model to use for semantic matching'),
  masterStartRow: z.number()
    .optional()
    .describe('Start matching from this row in master spreadsheet (1-based)'),
  sourceStartRow: z.number()
    .optional()
    .describe('Start matching from this row in source spreadsheet (1-based)')
});

const TransferDataInputSchema = z.object({
  masterSpreadsheetUrl: z.string()
    .describe('URL of the master Google Spreadsheet'),
  sourceSpreadsheetUrl: z.string()
    .describe('URL of the source Google Spreadsheet'),
  masterUniqueColumn: z.string()
    .describe('Unique identifier column in master spreadsheet (can be column letter like "A", "B", "AA", cell coordinate like "A2", "B3", or header name)'),
  sourceUniqueColumn: z.string()
    .describe('Unique identifier column in source spreadsheet (can be column letter like "A", "B", "AA", cell coordinate like "A2", "B3", or header name)'),
  valueColumns: z.array(ValueColumnMappingSchema)
    .describe('List of columns to transfer from source to master'),
  options: TransferOptionsSchema
    .optional()
    .default({})
    .describe('Transfer options including dry-run mode')
});

const PreviewMatchingInputSchema = z.object({
  masterSpreadsheetUrl: z.string()
    .describe('URL of the master Google Spreadsheet'),
  sourceSpreadsheetUrl: z.string()
    .describe('URL of the source Google Spreadsheet'),
  masterUniqueColumn: z.string()
    .describe('Unique identifier column in master spreadsheet (can be column letter like "A", "B", "AA", cell coordinate like "A2", "B3", or header name)'),
  sourceUniqueColumn: z.string()
    .describe('Unique identifier column in source spreadsheet (can be column letter like "A", "B", "AA", cell coordinate like "A2", "B3", or header name)'),
  matchModel: z.string()
    .optional()
    .default('gpt-4o-mini')
    .describe('OpenAI model to use for preview')
});

// Output schemas
const MatchOutputSchema = z.object({
  masterValue: z.string(),
  sourceValue: z.string(),
  confidence: z.number(),
  valuesToTransfer: z.record(z.union([z.string(), z.number(), z.null()]))
});

const UnmatchedOutputSchema = z.object({
  sourceValue: z.string(),
  sourceRowIndex: z.number(),
  reason: z.string(),
  bestCandidate: z.object({
    value: z.string(),
    confidence: z.number()
  }).optional()
});

const TransferSummarySchema = z.object({
  totalMasterRows: z.number(),
  totalSourceRows: z.number(),
  matched: z.number(),
  unmatched: z.number(),
  averageConfidence: z.number()
});

const TransferDataOutputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
  summary: TransferSummarySchema,
  mappings: z.array(MatchOutputSchema),
  unmatched: z.array(UnmatchedOutputSchema),
  updatedSpreadsheetUrl: z.string().optional()
});

const PreviewMatchingOutputSchema = z.object({
  success: z.boolean(),
  preview: z.object({
    masterUniqueValues: z.array(z.string()),
    sourceUniqueValues: z.array(z.string()),
    estimatedMatches: z.number(),
    sampleMatches: z.array(z.object({
      masterValue: z.string(),
      sourceValue: z.string(),
      confidence: z.number(),
      reasoning: z.string()
    })),
    estimatedAccuracy: z.number()
  })
});

// Tool definitions
export const spreadsheetTools = {
  spreadsheet_transfer_data: {
    description: 'Transfer data from source spreadsheet to master spreadsheet using semantic matching on unique columns',
    inputSchema: TransferDataInputSchema,
    outputSchema: TransferDataOutputSchema,
    handler: async (input: z.infer<typeof TransferDataInputSchema>) => {
      try {
        logger.info('Starting spreadsheet data transfer', {
          masterUrl: input.masterSpreadsheetUrl,
          sourceUrl: input.sourceSpreadsheetUrl,
          dryRun: input.options?.dryRun
        });

        // Check if we're using coordinate-based mode (any column is a coordinate)
        const masterUsesCoordinate = googleSheetsClient.isCoordinate(input.masterUniqueColumn);
        const sourceUsesCoordinate = googleSheetsClient.isCoordinate(input.sourceUniqueColumn);
        const anyValueUsesCoordinate = input.valueColumns.some(m => 
          googleSheetsClient.isCoordinate(m.masterColumn) || googleSheetsClient.isCoordinate(m.sourceColumn)
        );
        
        const coordinateMode = masterUsesCoordinate || sourceUsesCoordinate || anyValueUsesCoordinate;

        if (coordinateMode) {
          logger.info('Using coordinate-based mode (direct column access)');
        }

        // Note: Row offsets are no longer needed here - we now store actual spreadsheet row numbers
        // directly in the rowIndex field during data extraction

        // 1. Read both spreadsheets
        const [masterData, sourceData] = await Promise.all([
          googleSheetsClient.readSpreadsheet(input.masterSpreadsheetUrl),
          googleSheetsClient.readSpreadsheet(input.sourceSpreadsheetUrl)
        ]);

        // 2. Resolve column identifiers (supports both coordinates and header names)
        let masterUniqueHeader: string;
        let sourceUniqueHeader: string;

        if (masterUsesCoordinate) {
          // Use coordinate directly as the header reference
          masterUniqueHeader = input.masterUniqueColumn.toUpperCase();
          logger.info('Using coordinate mode for master unique column', { 
            input: input.masterUniqueColumn, 
            resolved: masterUniqueHeader 
          });
        } else {
          masterUniqueHeader = googleSheetsClient.getColumnHeader(input.masterUniqueColumn, masterData.headers);
        }

        if (sourceUsesCoordinate) {
          sourceUniqueHeader = input.sourceUniqueColumn.toUpperCase();
          logger.info('Using coordinate mode for source unique column', { 
            input: input.sourceUniqueColumn, 
            resolved: sourceUniqueHeader 
          });
        } else {
          sourceUniqueHeader = googleSheetsClient.getColumnHeader(input.sourceUniqueColumn, sourceData.headers);
        }

        // Resolve and validate value columns
        const resolvedMappings = input.valueColumns.map(mapping => {
          const sourceIsCoord = googleSheetsClient.isCoordinate(mapping.sourceColumn);
          const masterIsCoord = googleSheetsClient.isCoordinate(mapping.masterColumn);
          
          return {
            original: mapping,
            sourceHeader: sourceIsCoord ? mapping.sourceColumn.toUpperCase() : googleSheetsClient.getColumnHeader(mapping.sourceColumn, sourceData.headers),
            masterHeader: masterIsCoord ? mapping.masterColumn.toUpperCase() : googleSheetsClient.getColumnHeader(mapping.masterColumn, masterData.headers),
            sourceIsCoordinate: sourceIsCoord,
            masterIsCoordinate: masterIsCoord
          };
        });

        logger.info('Resolved column identifiers', {
          masterUnique: { input: input.masterUniqueColumn, resolved: masterUniqueHeader, isCoordinate: masterUsesCoordinate },
          sourceUnique: { input: input.sourceUniqueColumn, resolved: sourceUniqueHeader, isCoordinate: sourceUsesCoordinate },
          valueColumns: resolvedMappings.map(m => ({
            source: { input: m.original.sourceColumn, resolved: m.sourceHeader, isCoordinate: m.sourceIsCoordinate },
            master: { input: m.original.masterColumn, resolved: m.masterHeader, isCoordinate: m.masterIsCoordinate }
          }))
        });

        // 3. Extract unique values with ACTUAL SPREADSHEET ROW NUMBERS
        // rowIndex will store the actual spreadsheet row (1-based), NOT array index
        let masterValues: Array<{ value: string; rowIndex: number }>;
        let sourceValues: Array<{ value: string; rowIndex: number }>;
        let masterStartRow: number;
        let sourceStartRow: number;

        if (masterUsesCoordinate) {
          // Read column data directly by coordinate
          // D4 means start from row 4, B2 means start from row 2
          const result = await googleSheetsClient.readColumnByCoordinate(input.masterSpreadsheetUrl, input.masterUniqueColumn);
          masterStartRow = result.startRow;
          
          masterValues = result.values.map((value, index) => ({
            value: String(value ?? ''),
            // Actual spreadsheet row number = startRow + index
            rowIndex: masterStartRow + index
          })).filter(item => item.value !== '');
          
          logger.info('Read master column by coordinate', {
            coordinate: input.masterUniqueColumn,
            startRow: masterStartRow,
            totalValues: result.values.length,
            nonEmptyValues: masterValues.length,
            sampleValues: masterValues.slice(0, 5).map(v => ({ value: v.value.substring(0, 50), row: v.rowIndex }))
          });
        } else {
          // For header-based mode, data starts after header row
          masterStartRow = masterData.headerRowIndex + 2; // headerRowIndex is 0-based, +1 for 1-based, +1 to skip header
          
          masterValues = masterData.rows.map((row, index) => ({
            value: String(row[masterUniqueHeader] ?? ''),
            // Actual spreadsheet row number
            rowIndex: masterStartRow + index
          })).filter(item => item.value !== '');
          
          logger.info('Read master column by header', {
            header: masterUniqueHeader,
            startRow: masterStartRow,
            totalRows: masterData.rows.length,
            nonEmptyValues: masterValues.length
          });
        }

        if (sourceUsesCoordinate) {
          const result = await googleSheetsClient.readColumnByCoordinate(input.sourceSpreadsheetUrl, input.sourceUniqueColumn);
          sourceStartRow = result.startRow;
          
          sourceValues = result.values.map((value, index) => ({
            value: String(value ?? ''),
            rowIndex: sourceStartRow + index
          })).filter(item => item.value !== '');
          
          logger.info('Read source column by coordinate', {
            coordinate: input.sourceUniqueColumn,
            startRow: sourceStartRow,
            totalValues: result.values.length,
            nonEmptyValues: sourceValues.length,
            sampleValues: sourceValues.slice(0, 5).map(v => ({ value: v.value.substring(0, 50), row: v.rowIndex }))
          });
        } else {
          sourceStartRow = sourceData.headerRowIndex + 2;
          
          sourceValues = sourceData.rows.map((row, index) => ({
            value: String(row[sourceUniqueHeader] ?? ''),
            rowIndex: sourceStartRow + index
          })).filter(item => item.value !== '');
          
          logger.info('Read source column by header', {
            header: sourceUniqueHeader,
            startRow: sourceStartRow,
            totalRows: sourceData.rows.length,
            nonEmptyValues: sourceValues.length
          });
        }

        logger.info('Extracted unique values', {
          masterCount: masterValues.length,
          sourceCount: sourceValues.length,
          masterRowRange: masterValues.length > 0 
            ? `${masterValues[0].rowIndex} - ${masterValues[masterValues.length - 1].rowIndex}` 
            : 'none',
          sourceRowRange: sourceValues.length > 0 
            ? `${sourceValues[0].rowIndex} - ${sourceValues[sourceValues.length - 1].rowIndex}` 
            : 'none'
        });

        // Note: We no longer need options.masterStartRow or options.sourceStartRow
        // because the start row is already determined by the coordinate (D4 = row 4)

        // 4. Perform semantic matching
        const options = input.options || {};
        const { matches, unmatched } = await semanticMatcher.matchValues(
          masterValues,
          sourceValues,
          options.confidenceThreshold ?? 0.8,
          options.matchModel ?? 'gpt-4o-mini'
        );

        // 5. Prepare data transfers
        // IMPORTANT: match.masterRowIndex and match.sourceRowIndex are now ACTUAL SPREADSHEET ROW NUMBERS (1-based)
        // For example, if user specified D4 for master and B2 for source:
        // - masterRowIndex might be 4, 5, 6, 7... (actual rows in spreadsheet)
        // - sourceRowIndex might be 2, 3, 4, 5... (actual rows in spreadsheet)
        
        const mappings: Array<{
          masterValue: string;
          sourceValue: string;
          confidence: number;
          valuesToTransfer: Record<string, string | number | null>;
        }> = [];

        const updates: Array<{ rowIndex: number; columnName: string; value: string | number | null }> = [];

        // For coordinate mode, cache column data with their start rows
        const sourceColumnCache: Map<string, { values: string[]; startRow: number }> = new Map();
        
        for (const resolvedMapping of resolvedMappings) {
          if (resolvedMapping.sourceIsCoordinate) {
            const result = await googleSheetsClient.readColumnByCoordinate(input.sourceSpreadsheetUrl, resolvedMapping.sourceHeader);
            sourceColumnCache.set(resolvedMapping.sourceHeader, result);
          }
        }

        for (const match of matches) {
          // match.sourceRowIndex is ACTUAL SPREADSHEET ROW NUMBER (e.g., 2, 3, 4...)
          // To access sourceData.rows, we need to convert to 0-based index from data start
          const sourceDataArrayIndex = match.sourceRowIndex - sourceStartRow;
          
          // Safely access source row
          const sourceRow = sourceDataArrayIndex >= 0 && sourceDataArrayIndex < sourceData.rows.length 
            ? sourceData.rows[sourceDataArrayIndex] 
            : undefined;
            
          const valuesToTransfer: Record<string, string | number | null> = {};

          logger.debug('Processing match', {
            masterValue: match.masterValue,
            sourceValue: match.sourceValue,
            masterRowIndex: match.masterRowIndex,
            sourceRowIndex: match.sourceRowIndex,
            sourceStartRow,
            sourceDataArrayIndex,
            hasSourceRow: !!sourceRow
          });

          for (const resolvedMapping of resolvedMappings) {
            let sourceValue: string | number | null;
            
            if (resolvedMapping.sourceIsCoordinate) {
              // Read from cached column data
              // Cache startRow might be different from unique column startRow
              const cacheData = sourceColumnCache.get(resolvedMapping.sourceHeader);
              if (cacheData) {
                // Convert actual row number to array index in this specific cache
                const cacheArrayIndex = match.sourceRowIndex - cacheData.startRow;
                sourceValue = cacheArrayIndex >= 0 && cacheArrayIndex < cacheData.values.length 
                  ? cacheData.values[cacheArrayIndex] 
                  : null;
                
                logger.debug('Reading from coordinate cache', {
                  column: resolvedMapping.sourceHeader,
                  sourceRowIndex: match.sourceRowIndex,
                  cacheStartRow: cacheData.startRow,
                  cacheArrayIndex,
                  cacheSize: cacheData.values.length,
                  foundValue: sourceValue
                });
              } else {
                sourceValue = null;
              }
            } else {
              // Read from row object
              if (!sourceRow) {
                logger.warn('Source row not found', {
                  sourceRowIndex: match.sourceRowIndex,
                  sourceStartRow,
                  sourceDataArrayIndex,
                  totalRows: sourceData.rows.length
                });
                sourceValue = null;
              } else {
                sourceValue = sourceRow[resolvedMapping.sourceHeader] ?? null;
              }
            }
            
            valuesToTransfer[resolvedMapping.masterHeader] = sourceValue ?? null;

            if (!options.dryRun) {
              // match.masterRowIndex is ALREADY the actual spreadsheet row number
              // We pass it directly - updateSpreadsheet will use it as-is
              updates.push({
                rowIndex: match.masterRowIndex,
                columnName: resolvedMapping.masterHeader,
                value: sourceValue ?? null
              });
            }
          }

          mappings.push({
            masterValue: match.masterValue,
            sourceValue: match.sourceValue,
            confidence: match.confidence,
            valuesToTransfer
          });
        }

        // 6. Execute updates if not dry run
        if (!options.dryRun && updates.length > 0) {
          // updates[].rowIndex is now the ACTUAL spreadsheet row number (1-based)
          // We need to pass baseRowIndex = 0 so that: apiRowIndex = 0 + rowIndex = rowIndex
          // This way the actual row number is used directly
          const masterBaseRow = 0;  // rowIndex is already the actual row number
          
          logger.info('Executing spreadsheet updates', {
            updateCount: updates.length,
            sampleUpdates: updates.slice(0, 5).map(u => ({
              targetRow: u.rowIndex,
              column: u.columnName,
              value: u.value
            }))
          });
          
          await googleSheetsClient.updateSpreadsheet(
            input.masterSpreadsheetUrl,
            masterData,
            updates,
            masterBaseRow
          );
        }

        // 7. Calculate average confidence
        const avgConfidence = matches.length > 0
          ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length
          : 0;

        // 8. Build response
        const result: TransferResult = {
          success: true,
          dryRun: options.dryRun ?? false,
          summary: {
            totalMasterRows: masterData.rows.length,
            totalSourceRows: sourceData.rows.length,
            matched: matches.length,
            unmatched: unmatched.length,
            averageConfidence: Math.round(avgConfidence * 100) / 100
          },
          mappings,
          unmatched: unmatched.map(u => ({
            sourceValue: u.sourceValue,
            sourceRowIndex: u.sourceRowIndex,
            reason: u.reason,
            bestCandidate: u.bestCandidate
          })),
          updatedSpreadsheetUrl: options.dryRun ? undefined : input.masterSpreadsheetUrl
        };

        logger.info('Data transfer completed', {
          matched: result.summary.matched,
          unmatched: result.summary.unmatched,
          avgConfidence: result.summary.averageConfidence
        });

        return formatResult(result as unknown as Record<string, unknown>);
      } catch (error) {
        logger.error('Error in spreadsheet_transfer_data:', error);
        throw error;
      }
    }
  },

  spreadsheet_preview_matching: {
    description: 'Preview semantic matching between two spreadsheets without performing any data transfer',
    inputSchema: PreviewMatchingInputSchema,
    outputSchema: PreviewMatchingOutputSchema,
    handler: async (input: z.infer<typeof PreviewMatchingInputSchema>) => {
      try {
        logger.info('Starting matching preview', {
          masterUrl: input.masterSpreadsheetUrl,
          sourceUrl: input.sourceSpreadsheetUrl
        });

        // 1. Read both spreadsheets
        const [masterData, sourceData] = await Promise.all([
          googleSheetsClient.readSpreadsheet(input.masterSpreadsheetUrl),
          googleSheetsClient.readSpreadsheet(input.sourceSpreadsheetUrl)
        ]);

        // 2. Resolve column identifiers (supports both coordinates and header names)
        const masterUniqueHeader = googleSheetsClient.getColumnHeader(input.masterUniqueColumn, masterData.headers);
        const sourceUniqueHeader = googleSheetsClient.getColumnHeader(input.sourceUniqueColumn, sourceData.headers);

        logger.info('Resolved column identifiers for preview', {
          masterUnique: { input: input.masterUniqueColumn, resolved: masterUniqueHeader },
          sourceUnique: { input: input.sourceUniqueColumn, resolved: sourceUniqueHeader }
        });

        // 3. Extract unique values
        const masterUniqueValues = masterData.rows
          .map(row => String(row[masterUniqueHeader] ?? ''))
          .filter(v => v !== '');

        const sourceUniqueValues = sourceData.rows
          .map(row => String(row[sourceUniqueHeader] ?? ''))
          .filter(v => v !== '');

        // 4. Get preview from LLM
        const preview = await semanticMatcher.previewMatching(
          masterUniqueValues,
          sourceUniqueValues,
          input.matchModel ?? 'gpt-4o-mini'
        );

        const result = {
          success: true,
          preview: {
            masterUniqueValues: masterUniqueValues.slice(0, 20),
            sourceUniqueValues: sourceUniqueValues.slice(0, 20),
            estimatedMatches: Math.min(masterUniqueValues.length, sourceUniqueValues.length),
            sampleMatches: preview.sampleMatches,
            estimatedAccuracy: preview.estimatedAccuracy
          }
        };

        logger.info('Matching preview completed');

        return formatResult(result);
      } catch (error) {
        logger.error('Error in spreadsheet_preview_matching:', error);
        throw error;
      }
    }
  },

  spreadsheet_check_oauth_status: {
    description: 'Check Google OAuth authentication status and get authorization URL if needed',
    inputSchema: z.object({}),
    outputSchema: z.object({
      configured: z.boolean(),
      authenticated: z.boolean(),
      authUrl: z.string().optional(),
      message: z.string()
    }),
    handler: async () => {
      try {
        const configured = googleSheetsClient.isOAuthConfigured();
        const authenticated = googleSheetsClient.isAuthenticated();

        let authUrl: string | undefined;
        let message: string;

        if (!configured) {
          message = 'OAuth not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI environment variables.';
        } else if (!authenticated) {
          authUrl = googleSheetsClient.getAuthUrl() || undefined;
          message = authUrl 
            ? 'OAuth configured but not authenticated. Please visit the authUrl to authenticate.'
            : 'Failed to generate authentication URL.';
        } else {
          message = 'OAuth configured and authenticated. Write operations are available.';
        }

        logger.info('OAuth status check', { configured, authenticated });

        return formatResult({
          configured,
          authenticated,
          authUrl,
          message
        });
      } catch (error) {
        logger.error('Error checking OAuth status:', error);
        throw error;
      }
    }
  }
};
