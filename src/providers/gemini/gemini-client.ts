import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/index.js';
import { mcpLogger as logger } from '../../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

export interface FileSearchStoreInfo {
  name: string;
  displayName?: string;
  createTime?: string;
  updateTime?: string;
}

export interface FileSearchDocumentInfo {
  name: string;
  displayName?: string;
  createTime?: string;
  updateTime?: string;
}

export interface QueryResult {
  text: string;
  groundingMetadata?: Record<string, unknown>;
}

export class GeminiClient {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: config.gemini.apiKey,
    });
  }

  /**
   * Create a new FileSearchStore
   */
  async createStore(displayName: string): Promise<FileSearchStoreInfo> {
    logger.info('Creating FileSearchStore', { displayName });

    const store = await this.ai.fileSearchStores.create({
      config: { displayName },
    });

    logger.info('FileSearchStore created', { name: store.name, displayName: store.displayName });

    return {
      name: store.name || '',
      displayName: store.displayName,
      createTime: store.createTime,
      updateTime: store.updateTime,
    };
  }

  /**
   * List all FileSearchStores
   */
  async listStores(): Promise<FileSearchStoreInfo[]> {
    logger.info('Listing FileSearchStores');

    const stores: FileSearchStoreInfo[] = [];
    const storeList = await this.ai.fileSearchStores.list();

    for await (const store of storeList) {
      stores.push({
        name: store.name || '',
        displayName: store.displayName,
        createTime: store.createTime,
        updateTime: store.updateTime,
      });
    }

    logger.info('Listed FileSearchStores', { count: stores.length });
    return stores;
  }

  /**
   * Delete a FileSearchStore (force delete all documents)
   */
  async deleteStore(storeName: string): Promise<void> {
    logger.info('Deleting FileSearchStore', { storeName });

    await this.ai.fileSearchStores.delete({
      name: storeName,
      config: { force: true },
    });

    logger.info('FileSearchStore deleted', { storeName });
  }

  /**
   * Upload a file to a FileSearchStore and wait for indexing to complete
   */
  async uploadFile(
    storeName: string,
    filePath: string,
    displayName?: string
  ): Promise<FileSearchDocumentInfo> {
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    const fileName = displayName || path.basename(resolvedPath);
    logger.info('Uploading file to FileSearchStore', {
      storeName,
      filePath: resolvedPath,
      displayName: fileName,
    });

    let operation = await this.ai.fileSearchStores.uploadToFileSearchStore({
      file: resolvedPath,
      fileSearchStoreName: storeName,
      config: {
        displayName: fileName,
      },
    });

    // Poll until the operation is done
    const maxRetries = 60; // 5 minutes max (5s intervals)
    let retries = 0;
    while (!operation.done && retries < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      operation = await this.ai.operations.get({ operation });
      retries++;
      logger.info('Upload operation polling', { retries, done: operation.done });
    }

    if (!operation.done) {
      throw new Error('Upload operation timed out after 5 minutes');
    }

    logger.info('File uploaded and indexed', { storeName, fileName });

    // The operation result contains document info
    const operationAny = operation as unknown as Record<string, unknown>;
    const result = operationAny.result as Record<string, unknown> | undefined;
    return {
      name: (result?.name as string) || '',
      displayName: (result?.displayName as string) || fileName,
      createTime: result?.createTime as string | undefined,
      updateTime: result?.updateTime as string | undefined,
    };
  }

  /**
   * List documents in a FileSearchStore
   */
  async listDocuments(storeName: string): Promise<FileSearchDocumentInfo[]> {
    logger.info('Listing documents in FileSearchStore', { storeName });

    const documents: FileSearchDocumentInfo[] = [];
    const docList = await this.ai.fileSearchStores.documents.list({
      parent: storeName,
    });

    for await (const doc of docList) {
      documents.push({
        name: doc.name || '',
        displayName: doc.displayName,
        createTime: doc.createTime,
        updateTime: doc.updateTime,
      });
    }

    logger.info('Listed documents', { storeName, count: documents.length });
    return documents;
  }

  /**
   * Delete a document from a FileSearchStore
   */
  async deleteDocument(documentName: string): Promise<void> {
    logger.info('Deleting document', { documentName });

    await this.ai.fileSearchStores.documents.delete({
      name: documentName,
    });

    logger.info('Document deleted', { documentName });
  }

  /**
   * Query a FileSearchStore using Gemini with RAG
   */
  async query(
    storeName: string,
    prompt: string,
    model: string = 'gemini-2.5-flash-lite'
  ): Promise<QueryResult> {
    logger.info('Querying FileSearchStore', {
      storeName,
      prompt: prompt.substring(0, 200),
      model,
    });

    const response = await this.ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [
          {
            fileSearch: {
              fileSearchStoreNames: [storeName],
            },
          },
        ],
      },
    });

    const text = response.text || 'No response from model';
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata as
      | Record<string, unknown>
      | undefined;

    logger.info('Query completed', {
      responseLength: text.length,
      hasGroundingMetadata: !!groundingMetadata,
    });

    return { text, groundingMetadata };
  }
}

// Singleton export
export const geminiClient = new GeminiClient();
