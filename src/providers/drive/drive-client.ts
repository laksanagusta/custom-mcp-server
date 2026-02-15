import { google, drive_v3, Auth } from 'googleapis';
import { config } from '../../config/index.js';
import { mcpLogger as logger } from '../../utils/logger.js';
import { PDFParse } from 'pdf-parse';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

export interface DriveFolder {
  id: string;
  name: string;
}

export interface FileContent {
  fileName: string;
  mimeType: string;
  textContent: string;
}

export class GoogleDriveClient {
  private oauth2Client: Auth.OAuth2Client | null = null;

  constructor() {
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
   * Get authenticated Drive client
   */
  private getAuthenticatedDrive(): drive_v3.Drive {
    if (!this.oauth2Client) {
      throw new Error('OAuth2 not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI');
    }

    return google.drive({
      version: 'v3',
      auth: this.oauth2Client
    });
  }

  /**
   * Extract folder ID from Google Drive URL or return as-is if already an ID
   * Supports:
   * - https://drive.google.com/drive/folders/FOLDER_ID
   * - https://drive.google.com/drive/folders/FOLDER_ID?usp=sharing
   * - https://drive.google.com/drive/u/0/folders/FOLDER_ID
   * - Plain folder ID
   */
  extractFolderId(urlOrId: string): string {
    const trimmed = urlOrId.trim();

    // Try to extract from URL
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) {
      return folderMatch[1];
    }

    // If it doesn't look like a URL, treat as folder ID directly
    if (!trimmed.includes('/')) {
      return trimmed;
    }

    throw new Error(`Cannot extract folder ID from: ${urlOrId}`);
  }

  /**
   * List all files in a folder (non-recursive)
   */
  async listFilesInFolder(folderId: string): Promise<DriveFile[]> {
    const drive = this.getAuthenticatedDrive();

    const files: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size)',
        pageSize: 100,
        pageToken
      });

      if (response.data.files) {
        for (const file of response.data.files) {
          files.push({
            id: file.id!,
            name: file.name!,
            mimeType: file.mimeType!,
            size: file.size || undefined
          });
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    logger.info('Listed files in folder', { folderId, fileCount: files.length });
    return files;
  }

  /**
   * List all subfolders in a folder
   */
  async listSubfolders(folderId: string): Promise<DriveFolder[]> {
    const drive = this.getAuthenticatedDrive();

    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 100
    });

    const folders = (response.data.files || []).map(f => ({
      id: f.id!,
      name: f.name!
    }));

    logger.info('Listed subfolders', { folderId, folderCount: folders.length });
    return folders;
  }

  /**
   * Find a subfolder by name (case-insensitive) within a parent folder
   */
  async findSubfolderByName(parentFolderId: string, folderName: string): Promise<DriveFolder | null> {
    const subfolders = await this.listSubfolders(parentFolderId);
    const normalizedName = folderName.trim().toLowerCase();
    
    const found = subfolders.find(f => f.name.trim().toLowerCase() === normalizedName);
    
    if (found) {
      logger.info('Found subfolder', { parentFolderId, folderName, foundId: found.id });
    } else {
      logger.warn('Subfolder not found', { parentFolderId, folderName, availableFolders: subfolders.map(f => f.name) });
    }

    return found || null;
  }

  /**
   * Download and extract text content from a file
   * Supports: text files, Google Docs (exported as text), Google Sheets (exported as CSV),
   * PDF (metadata only), and other text-based formats
   */
  async getFileContent(fileId: string, mimeType: string, fileName: string): Promise<FileContent> {
    const drive = this.getAuthenticatedDrive();

    try {
      let textContent: string;

      if (mimeType === 'application/vnd.google-apps.document') {
        // Google Docs → export as plain text
        const response = await drive.files.export({
          fileId,
          mimeType: 'text/plain'
        }, { responseType: 'text' });
        textContent = response.data as string;

      } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        // Google Sheets → export as CSV
        const response = await drive.files.export({
          fileId,
          mimeType: 'text/csv'
        }, { responseType: 'text' });
        textContent = response.data as string;

      } else if (mimeType === 'application/vnd.google-apps.presentation') {
        // Google Slides → export as plain text
        const response = await drive.files.export({
          fileId,
          mimeType: 'text/plain'
        }, { responseType: 'text' });
        textContent = response.data as string;

      } else if (this.isTextMimeType(mimeType)) {
        // Regular text-based files (txt, csv, md, json, xml, etc.)
        const response = await drive.files.get({
          fileId,
          alt: 'media'
        }, { responseType: 'text' });
        textContent = response.data as string;

      } else if (mimeType === 'application/pdf') {
        // PDF — download binary and parse with pdf-parse v2
        try {
          const response = await drive.files.get({
            fileId,
            alt: 'media'
          }, { responseType: 'arraybuffer' });
          const buffer = Buffer.from(response.data as ArrayBuffer);
          const parser = new PDFParse({ data: new Uint8Array(buffer) });
          const textResult = await parser.getText();
          textContent = textResult.text || `[File: ${fileName} - PDF file, no text content found]`;
          await parser.destroy();
          logger.info('PDF parsed successfully', { fileName, textLength: textContent.length });
        } catch (pdfError) {
          logger.error('PDF parsing failed', { fileName, error: pdfError });
          textContent = `[File: ${fileName} - PDF file, content extraction failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}]`;
        }
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        // Word docs — try Google Docs conversion
        try {
          // First, check if we can get it as Google Doc
          const response = await drive.files.get({
            fileId,
            alt: 'media'
          }, { responseType: 'arraybuffer' });
          textContent = `[File: ${fileName} - Word document, raw content extracted]\n` + 
            this.extractTextFromBuffer(Buffer.from(response.data as ArrayBuffer));
        } catch {
          textContent = `[File: ${fileName} - Word document, content extraction not available]`;
        }
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel'
      ) {
        // Excel files — download and try to extract text
        try {
          const response = await drive.files.get({
            fileId,
            alt: 'media'
          }, { responseType: 'arraybuffer' });
          textContent = `[File: ${fileName} - Excel spreadsheet, raw content extracted]\n` +
            this.extractTextFromBuffer(Buffer.from(response.data as ArrayBuffer));
        } catch {
          textContent = `[File: ${fileName} - Excel spreadsheet, content extraction not available]`;
        }
      } else {
        // Unsupported file type
        textContent = `[File: ${fileName} - Unsupported file type: ${mimeType}]`;
      }

      logger.info('Got file content', { fileId, fileName, mimeType, contentLength: textContent.length });

      return {
        fileName,
        mimeType,
        textContent
      };
    } catch (error) {
      logger.error('Error getting file content', { fileId, fileName, mimeType, error });
      return {
        fileName,
        mimeType,
        textContent: `[Error reading file: ${fileName} - ${error instanceof Error ? error.message : 'Unknown error'}]`
      };
    }
  }

  /**
   * Get all file contents from a folder
   */
  async getAllFileContentsFromFolder(folderId: string): Promise<FileContent[]> {
    const files = await this.listFilesInFolder(folderId);
    const contents: FileContent[] = [];

    for (const file of files) {
      const content = await this.getFileContent(file.id, file.mimeType, file.name);
      contents.push(content);
    }

    return contents;
  }

  /**
   * Check if a MIME type is text-based
   */
  private isTextMimeType(mimeType: string): boolean {
    const textTypes = [
      'text/',
      'application/json',
      'application/xml',
      'application/javascript',
      'application/typescript',
      'application/x-yaml',
      'application/yaml',
      'application/csv',
    ];
    return textTypes.some(t => mimeType.startsWith(t) || mimeType === t);
  }

  /**
   * Try to extract readable text from a binary buffer
   * Very basic — just tries to decode as UTF-8 and filter out non-printable chars
   */
  private extractTextFromBuffer(buffer: Buffer): string {
    try {
      const text = buffer.toString('utf-8');
      // Filter out non-printable characters but keep newlines, tabs, etc.
      const cleaned = text.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, ' ');
      // Collapse multiple spaces
      return cleaned.replace(/\s{3,}/g, '  ').trim().substring(0, 50000); // Limit to 50k chars
    } catch {
      return '[Could not extract text from binary file]';
    }
  }
}

// Export singleton instance
export const googleDriveClient = new GoogleDriveClient();
