import { z } from 'zod';
import { GeminiClient } from '../providers/gemini/gemini-client.js';
import { mcpLogger as logger } from '../utils/logger.js';

const geminiClient = new GeminiClient();

// --- Helper ---

function formatResult(data: Record<string, unknown>) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(data, null, 2) }
    ],
  };
}

// --- Tool Definitions ---

export const geminiFileSearchTools = {

  // ==========================================
  // 1. Create Knowledge Store
  // ==========================================
  gemini_create_knowledge_store: {
    description:
      'Create a new Gemini knowledge store (FileSearchStore) for uploading and indexing documents. ' +
      'Use this before uploading any files.',
    inputSchema: z.object({
      displayName: z.string()
        .describe('A human-readable display name for the knowledge store'),
    }),

    async handler(input: { displayName: string }) {
      try {
        const store = await geminiClient.createStore(input.displayName);
        return formatResult({
          success: true,
          store,
        });
      } catch (error) {
        logger.error('Failed to create knowledge store', { error });
        return formatResult({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  },

  // ==========================================
  // 2. Upload Knowledge
  // ==========================================
  gemini_upload_knowledge: {
    description:
      'Upload a file to a Gemini knowledge store for indexing. ' +
      'The file will be chunked, embedded, and indexed for semantic search. ' +
      'Supported formats: PDF, DOCX, TXT, JSON, code files, and more. ' +
      'You must provide the store name (e.g., "fileSearchStores/xxx") and a local file path.',
    inputSchema: z.object({
      storeName: z.string()
        .describe('The knowledge store name (e.g., "fileSearchStores/abc123")'),
      filePath: z.string()
        .describe('Absolute path to the local file to upload'),
      displayName: z.string()
        .optional()
        .describe('Optional display name for the file (defaults to filename)'),
    }),

    async handler(input: { storeName: string; filePath: string; displayName?: string }) {
      try {
        const document = await geminiClient.uploadFile(
          input.storeName,
          input.filePath,
          input.displayName
        );
        return formatResult({
          success: true,
          document,
        });
      } catch (error) {
        logger.error('Failed to upload knowledge', { error });
        return formatResult({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  },

  // ==========================================
  // 3. Query Knowledge
  // ==========================================
  gemini_query_knowledge: {
    description:
      'Query a Gemini knowledge store using semantic search (RAG). ' +
      'Sends a prompt to Gemini which searches the knowledge store for relevant context, ' +
      'then generates a grounded response with citations.',
    inputSchema: z.object({
      storeName: z.string()
        .describe('The knowledge store name to query (e.g., "fileSearchStores/abc123")'),
      prompt: z.string()
        .describe('The question or prompt to search the knowledge base with'),
      model: z.string()
        .optional()
        .default('gemini-2.5-flash-lite')
        .describe('Gemini model to use (default: gemini-2.5-flash-lite). Supported: gemini-2.5-pro, gemini-2.5-flash-lite, gemini-3-flash-preview, gemini-3-pro-preview'),
    }),

    async handler(input: { storeName: string; prompt: string; model?: string }) {
      try {
        const result = await geminiClient.query(
          input.storeName,
          input.prompt,
          input.model || 'gemini-2.5-flash-lite'
        );
        return formatResult({
          success: true,
          response: result.text,
          groundingMetadata: result.groundingMetadata,
        });
      } catch (error) {
        logger.error('Failed to query knowledge', { error });
        return formatResult({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  },

  // ==========================================
  // 4. List Knowledge Stores
  // ==========================================
  gemini_list_knowledge_stores: {
    description:
      'List all available Gemini knowledge stores (FileSearchStores). ' +
      'Returns store names and display names.',
    inputSchema: z.object({}),

    async handler() {
      try {
        const stores = await geminiClient.listStores();
        return formatResult({
          success: true,
          stores,
        });
      } catch (error) {
        logger.error('Failed to list knowledge stores', { error });
        return formatResult({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  },

  // ==========================================
  // 5. List Knowledge Documents
  // ==========================================
  gemini_list_knowledge_documents: {
    description:
      'List all documents in a specific Gemini knowledge store. ' +
      'Returns document names and display names.',
    inputSchema: z.object({
      storeName: z.string()
        .describe('The knowledge store name (e.g., "fileSearchStores/abc123")'),
    }),

    async handler(input: { storeName: string }) {
      try {
        const documents = await geminiClient.listDocuments(input.storeName);
        return formatResult({
          success: true,
          documents,
        });
      } catch (error) {
        logger.error('Failed to list knowledge documents', { error });
        return formatResult({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  },

  // ==========================================
  // 6. Delete Knowledge Document
  // ==========================================
  gemini_delete_knowledge_document: {
    description:
      'Delete a specific document from a Gemini knowledge store. ' +
      'Use gemini_list_knowledge_documents first to get the document name.',
    inputSchema: z.object({
      documentName: z.string()
        .describe('The full document name (e.g., "fileSearchStores/abc123/documents/doc456")'),
    }),

    async handler(input: { documentName: string }) {
      try {
        await geminiClient.deleteDocument(input.documentName);
        return formatResult({
          success: true,
          deletedDocument: input.documentName,
        });
      } catch (error) {
        logger.error('Failed to delete knowledge document', { error });
        return formatResult({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  },

  // ==========================================
  // 7. Delete Knowledge Store
  // ==========================================
  gemini_delete_knowledge_store: {
    description:
      'Delete an entire Gemini knowledge store and all its documents. ' +
      'This action is irreversible. Use gemini_list_knowledge_stores to find the store name.',
    inputSchema: z.object({
      storeName: z.string()
        .describe('The knowledge store name to delete (e.g., "fileSearchStores/abc123")'),
    }),

    async handler(input: { storeName: string }) {
      try {
        await geminiClient.deleteStore(input.storeName);
        return formatResult({
          success: true,
          deletedStore: input.storeName,
        });
      } catch (error) {
        logger.error('Failed to delete knowledge store', { error });
        return formatResult({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  },
};
