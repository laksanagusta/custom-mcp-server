export interface SpreadsheetRow {
  [columnName: string]: string | number | null;
}

export interface ValueColumnMapping {
  sourceColumn: string;
  masterColumn: string;
  operation?: 'insert' | 'update' | 'sum' | 'average';
}

export interface MatchResult {
  masterValue: string;
  sourceValue: string;
  confidence: number;
  masterRowIndex: number;
  sourceRowIndex: number;
}

export interface UnmatchedItem {
  sourceValue: string;
  sourceRowIndex: number;
  reason: string;
  bestCandidate?: {
    value: string;
    confidence: number;
  };
}

export interface TransferOptions {
  dryRun?: boolean;
  confidenceThreshold?: number;
  matchModel?: string;
  masterStartRow?: number;
  sourceStartRow?: number;
}

export interface TransferResult {
  success: boolean;
  dryRun: boolean;
  summary: {
    totalMasterRows: number;
    totalSourceRows: number;
    matched: number;
    unmatched: number;
    averageConfidence: number;
  };
  mappings: Array<{
    masterValue: string;
    sourceValue: string;
    confidence: number;
    valuesToTransfer: Record<string, string | number | null>;
  }>;
  unmatched: UnmatchedItem[];
  updatedSpreadsheetUrl?: string;
}

export interface SheetData {
  spreadsheetId: string;
  sheetName: string;
  headers: string[];
  rows: SpreadsheetRow[];
  headerRowIndex: number;
}

export interface ColumnData {
  values: string[];
  rowCount: number;
}
