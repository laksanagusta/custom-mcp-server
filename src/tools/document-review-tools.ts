import { z } from 'zod';
import OpenAI from 'openai';
import { GoogleSheetsClient } from '../providers/spreadsheet/google-client.js';
import { GoogleDriveClient, FileContent } from '../providers/drive/drive-client.js';
import { config } from '../config/index.js';
import { mcpLogger as logger } from '../utils/logger.js';

const googleSheetsClient = new GoogleSheetsClient();
const googleDriveClient = new GoogleDriveClient();
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  timeout: 30 * 60 * 1000 // 30 minutes timeout
});

// --- Helper ---

function formatResult(data: Record<string, unknown>) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(data, null, 2) }
    ],
    structuredContent: data
  };
}

// --- Input/Output Schemas ---

const DocumentReviewInputSchema = z.object({
  spreadsheetUrl: z.string()
    .describe('URL of the Google Spreadsheet (kertas kerja) containing review instructions'),
  rootFolderUrl: z.string()
    .describe('URL or ID of the Google Drive root folder containing unit subfolders'),
  instructionColumn: z.string()
    .describe('Column coordinate for LLM instructions (e.g., "A1" means instructions start from A2)'),
  notesColumn: z.string()
    .describe('Column coordinate for notes/catatan output (e.g., "E1" means output starts at E2)'),
  targetFolderColumn: z.string()
    .describe('Column coordinate for target folder names (e.g., "C1", values comma-separated like "LAKIP,RKP,Notulen")'),
  model: z.string()
    .optional()
    .default('gpt-4o-mini')
    .describe('OpenAI model to use (default: gpt-4o-mini)'),
  dryRun: z.boolean()
    .optional()
    .default(false)
    .describe('If true, preview without writing to spreadsheet')
});

const RowResultSchema = z.object({
  rowNumber: z.number(),
  instruction: z.string(),
  targetFolders: z.array(z.string()),
  filesFound: z.number(),
  fileNames: z.array(z.string()),
  status: z.enum(['success', 'skipped', 'error']),
  notePreview: z.string().optional(),
  error: z.string().optional()
});

const DocumentReviewOutputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
  summary: z.object({
    totalRows: z.number(),
    processed: z.number(),
    skipped: z.number(),
    errors: z.number()
  }),
  results: z.array(RowResultSchema),
  spreadsheetUrl: z.string(),
  error: z.string().optional()
});

// --- Tool Definition ---

export const documentReviewTools = {
  document_review: {
    description: 'Review documents by reading a work paper spreadsheet (kertas kerja) with LLM instructions, ' +
      'fetching files from target Google Drive folders, sending them to LLM for review, ' +
      'and writing the results to the notes column. ' +
      'The spreadsheet must have columns for: instruction (instruksi LLM), target folders (comma-separated folder names), and notes (catatan).',
    inputSchema: DocumentReviewInputSchema,
    outputSchema: DocumentReviewOutputSchema,

    async handler(input: z.infer<typeof DocumentReviewInputSchema>) {
      const {
        spreadsheetUrl,
        rootFolderUrl,
        instructionColumn,
        notesColumn,
        targetFolderColumn,
        model,
        dryRun
      } = input;

      logger.info('Starting document review', {
        spreadsheetUrl,
        rootFolderUrl,
        instructionColumn,
        notesColumn,
        targetFolderColumn,
        model,
        dryRun
      });

      try {
        // 1. Extract root folder ID
        const rootFolderId = googleDriveClient.extractFolderId(rootFolderUrl);
        logger.info('Root folder ID', { rootFolderId });

        // 2. Read spreadsheet to get sheet data (for writing later)
        const sheetData = await googleSheetsClient.readSpreadsheet(spreadsheetUrl);

        // 3. Read columns by coordinate
        const instructionData = await googleSheetsClient.readColumnByCoordinate(spreadsheetUrl, instructionColumn);
        const targetFolderData = await googleSheetsClient.readColumnByCoordinate(spreadsheetUrl, targetFolderColumn);
        const notesData = await googleSheetsClient.readColumnByCoordinate(spreadsheetUrl, notesColumn);

        // The coordinate (e.g., "A1") defines the header, data starts from next row
        // readColumnByCoordinate already handles this — startRow is the row of the coordinate,
        // and values[0] is the header, values[1..] are data
        const instructionValues = instructionData.values.slice(1); // skip header
        const targetFolderValues = targetFolderData.values.slice(1); // skip header
        const dataStartRow = instructionData.startRow + 1; // actual spreadsheet row where data begins

        const totalRows = Math.max(instructionValues.length, targetFolderValues.length);
        logger.info('Read spreadsheet columns', {
          totalRows,
          instructionCount: instructionValues.length,
          targetFolderCount: targetFolderValues.length,
          dataStartRow
        });

        // 4. Pre-fetch all available subfolders in root
        const availableSubfolders = await googleDriveClient.listSubfolders(rootFolderId);
        const subfolderMap = new Map(
          availableSubfolders.map(f => [f.name.trim().toLowerCase(), f])
        );
        logger.info('Available subfolders in root', {
          count: availableSubfolders.length,
          names: availableSubfolders.map(f => f.name)
        });

        // 5. Process each row
        const results: z.infer<typeof RowResultSchema>[] = [];
        const updates: Array<{ rowIndex: number; columnName: string; value: string | number | null }> = [];
        let processed = 0;
        let skipped = 0;
        let errors = 0;

        // Extract notes column letter for writing
        const notesColumnLetter = googleSheetsClient.extractColumnFromCoordinate(notesColumn);

        for (let i = 0; i < totalRows; i++) {
          const instruction = instructionValues[i]?.trim() || '';
          const targetFolderStr = targetFolderValues[i]?.trim() || '';
          const actualRow = dataStartRow + i; // actual spreadsheet row number

          // Skip rows with no instruction or no target folder
          if (!instruction || !targetFolderStr) {
            results.push({
              rowNumber: actualRow,
              instruction: instruction || '(empty)',
              targetFolders: targetFolderStr ? targetFolderStr.split(',').map(s => s.trim()) : [],
              filesFound: 0,
              fileNames: [],
              status: 'skipped',
              notePreview: undefined,
              error: !instruction ? 'No instruction provided' : 'No target folder specified'
            });
            skipped++;
            continue;
          }

          // Parse target folder names (comma-separated)
          const targetFolderNames = targetFolderStr.split(',').map(s => s.trim()).filter(s => s.length > 0);

          try {
            // Collect files from all target folders
            const allFiles: FileContent[] = [];
            const allFileNames: string[] = [];
            const foundFolders: string[] = [];
            const notFoundFolders: string[] = [];

            for (const folderName of targetFolderNames) {
              const subfolder = subfolderMap.get(folderName.toLowerCase());

              if (!subfolder) {
                notFoundFolders.push(folderName);
                logger.warn('Target subfolder not found', { folderName, availableFolders: Array.from(subfolderMap.keys()) });
                continue;
              }

              foundFolders.push(folderName);
              const fileContents = await googleDriveClient.getAllFileContentsFromFolder(subfolder.id);
              allFiles.push(...fileContents);
              allFileNames.push(...fileContents.map(f => `[${folderName}] ${f.fileName}`));
            }

            if (allFiles.length === 0) {
              const errorMsg = notFoundFolders.length > 0
                ? `Folders not found: ${notFoundFolders.join(', ')}. Available: ${availableSubfolders.map(f => f.name).join(', ')}`
                : 'No files found in target folders';

              results.push({
                rowNumber: actualRow,
                instruction,
                targetFolders: targetFolderNames,
                filesFound: 0,
                fileNames: [],
                status: 'error',
                error: errorMsg
              });
              errors++;
              continue;
            }

            // Build the LLM prompt with all file contents
            const fileContextParts = allFiles.map(f =>
              `--- File: ${f.fileName} (${f.mimeType}) ---\n${f.textContent}\n--- End of ${f.fileName} ---`
            );

            const systemPrompt = `Kamu adalah asisten yang bertugas memeriksa dokumen. 
Kamu akan diberikan instruksi pemeriksaan dan konten dari beberapa file dokumen.
Berikan hasil pemeriksaan yang jelas dan terstruktur sesuai instruksi.
Jawab dalam Bahasa Indonesia.`;

            const userPrompt = `INSTRUKSI PEMERIKSAAN:
${instruction}

DOKUMEN YANG DIPERIKSA (${allFiles.length} file dari folder: ${foundFolders.join(', ')}):

${fileContextParts.join('\n\n')}

${notFoundFolders.length > 0 ? `\nCATATAN: Folder berikut tidak ditemukan: ${notFoundFolders.join(', ')}` : ''}

Berikan hasil pemeriksaan sesuai instruksi di atas.`;

            logger.info('Sending to LLM', {
              rowNumber: actualRow,
              instruction: instruction.substring(0, 100),
              fileCount: allFiles.length,
              totalContentLength: userPrompt.length,
              model
            });

            if (!dryRun) {
              // Call OpenAI
              const completion = await openai.chat.completions.create({
                model,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,
                max_tokens: 4096
              });

              const llmResponse = completion.choices[0]?.message?.content || 'No response from LLM';

              // Queue the update for the notes column
              updates.push({
                rowIndex: actualRow,
                columnName: notesColumnLetter,
                value: llmResponse
              });

              results.push({
                rowNumber: actualRow,
                instruction: instruction.substring(0, 200),
                targetFolders: targetFolderNames,
                filesFound: allFiles.length,
                fileNames: allFileNames,
                status: 'success',
                notePreview: llmResponse.substring(0, 500) + (llmResponse.length > 500 ? '...' : '')
              });
            } else {
              // Dry run - just preview
              results.push({
                rowNumber: actualRow,
                instruction: instruction.substring(0, 200),
                targetFolders: targetFolderNames,
                filesFound: allFiles.length,
                fileNames: allFileNames,
                status: 'success',
                notePreview: `[DRY RUN] Would send ${allFiles.length} files with instruction to ${model}`
              });
            }

            processed++;
          } catch (rowError) {
            logger.error('Error processing row', { rowNumber: actualRow, error: rowError });
            results.push({
              rowNumber: actualRow,
              instruction: instruction.substring(0, 200),
              targetFolders: targetFolderNames,
              filesFound: 0,
              fileNames: [],
              status: 'error',
              error: rowError instanceof Error ? rowError.message : 'Unknown error'
            });
            errors++;
          }
        }

        // 6. Write all updates to spreadsheet (if not dry run)
        if (!dryRun && updates.length > 0) {
          logger.info('Writing results to spreadsheet', { updateCount: updates.length });

          await googleSheetsClient.updateSpreadsheet(
            spreadsheetUrl,
            sheetData,
            updates,
            0 // rowIndex is already the actual spreadsheet row number
          );

          logger.info('Successfully wrote results to spreadsheet');
        }

        const result = {
          success: true,
          dryRun,
          summary: {
            totalRows,
            processed,
            skipped,
            errors
          },
          results,
          spreadsheetUrl
        };

        logger.info('Document review completed', result.summary);
        return formatResult(result as unknown as Record<string, unknown>);

      } catch (error) {
        logger.error('Document review failed', { error });

        const errorResult = {
          success: false,
          dryRun,
          summary: {
            totalRows: 0,
            processed: 0,
            skipped: 0,
            errors: 1
          },
          results: [],
          spreadsheetUrl,
          error: error instanceof Error ? error.message : 'Unknown error'
        };

        return formatResult(errorResult as unknown as Record<string, unknown>);
      }
    }
  }
};
