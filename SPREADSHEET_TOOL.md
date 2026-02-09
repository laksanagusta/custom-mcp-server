# Spreadsheet Semantic Matching Tool

Tool MCP Server untuk memindahkan dan menggabungkan data antar spreadsheet menggunakan semantic matching berbasis LLM.

## Fitur

- **Semantic Matching**: Menggunakan OpenAI API untuk memahami makna teks (bukan sekadar string matching)
- **Google Sheets Integration**: Mendukung URL Google Sheets langsung
- **Dry-run Mode**: Preview matching sebelum melakukan update
- **Confidence Scoring**: Setiap match memiliki skor kepercayaan 0-1
- **Mismatch Reporting**: Melaporkan data yang gagal di-match
- **Generic Matching**: Bekerja dengan kolom unique apapun (kota, produk, nama, dsb.)

## Setup Environment Variables

Tambahkan ke file `.env` atau environment variables:

```bash
# Google Sheets API Key (dari Google Cloud Console)
GOOGLE_SHEETS_API_KEY=your_google_sheets_api_key

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key
```

### Mendapatkan Google Sheets API Key

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru atau pilih existing project
3. Enable **Google Sheets API**
4. Buat API Key di Credentials
5. Jika spreadsheet private, tambahkan service account dan share spreadsheet ke email service account

## Tools

### 1. `spreadsheet_transfer_data`

Transfer data dari spreadsheet sumber ke master dengan semantic matching.

#### Input Parameters

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
    "dryRun": false,
    "confidenceThreshold": 0.8,
    "matchModel": "gpt-4o-mini"
  }
}
```

#### Parameters Detail

- **masterSpreadsheetUrl**: URL Google Spreadsheet master
- **sourceSpreadsheetUrl**: URL Google Spreadsheet sumber
- **masterUniqueColumn**: Nama kolom identifier di master
- **sourceUniqueColumn**: Nama kolom identifier di sumber
- **valueColumns**: Array kolom yang akan ditransfer
  - `sourceColumn`: Nama kolom di spreadsheet sumber
  - `masterColumn`: Nama kolom di spreadsheet master
  - `operation`: Operasi yang dilakukan (insert, update, sum, average)
- **options**:
  - `dryRun`: `true` untuk preview tanpa update
  - `confidenceThreshold`: Batas minimum confidence (0-1)
  - `matchModel`: Model OpenAI yang digunakan

#### Output

```json
{
  "success": true,
  "dryRun": false,
  "summary": {
    "totalMasterRows": 50,
    "totalSourceRows": 48,
    "matched": 45,
    "unmatched": 5,
    "averageConfidence": 0.92
  },
  "mappings": [
    {
      "masterValue": "kota Surabaya",
      "sourceValue": "Surabaya",
      "confidence": 0.95,
      "valuesToTransfer": {
        "Jumlah Penduduk": 2900000
      }
    }
  ],
  "unmatched": [
    {
      "sourceValue": "Kota X",
      "sourceRowIndex": 10,
      "reason": "No matching master value found",
      "bestCandidate": {
        "value": "Kota Y",
        "confidence": 0.45
      }
    }
  ],
  "updatedSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/MASTER_ID/edit"
}
```

### 2. `spreadsheet_preview_matching`

Preview semantic matching tanpa melakukan transfer data.

#### Input Parameters

```json
{
  "masterSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/MASTER_ID/edit",
  "sourceSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/SOURCE_ID/edit",
  "masterUniqueColumn": "Kota",
  "sourceUniqueColumn": "Nama Wilayah",
  "matchModel": "gpt-4o-mini"
}
```

#### Output

```json
{
  "success": true,
  "preview": {
    "masterUniqueValues": ["kota Surabaya", "kota Jakarta", "kota Bandung"],
    "sourceUniqueValues": ["Surabaya", "DKI Jakarta", "Bandung"],
    "estimatedMatches": 3,
    "sampleMatches": [
      {
        "masterValue": "kota Surabaya",
        "sourceValue": "Surabaya",
        "confidence": 0.95,
        "reasoning": "Same city, different format with prefix"
      }
    ],
    "estimatedAccuracy": 0.90
  }
}
```

## Use Cases

### Contoh 1: Matching Kota

**Master Spreadsheet:**
| Kota | Populasi |
|------|----------|
| kota Surabaya | |
| kota Jakarta | |

**Source Spreadsheet:**
| Nama Wilayah | Populasi 2024 |
|--------------|---------------|
| Surabaya | 2900000 |
| DKI Jakarta | 10500000 |

**Result:** Tool akan mengerti bahwa "kota Surabaya" ≈ "Surabaya"

### Contoh 2: Matching Produk

**Master Spreadsheet:**
| Product Code | Price |
|--------------|-------|
| PRD-A123 | |
| PRD-B456 | |

**Source Spreadsheet:**
| SKU | Unit Price |
|-----|------------|
| A123 | 50000 |
| B456 | 75000 |

**Result:** Tool akan mengerti bahwa "PRD-A123" ≈ "A123"

### Contoh 3: Matching Nama

**Master Spreadsheet:**
| Full Name | Email |
|-----------|-------|
| John Smith Jr. | |
| Jane Doe | |

**Source Spreadsheet:**
| Name | Email Address |
|------|---------------|
| Smith, John | john@example.com |
| Doe, Jane | jane@example.com |

**Result:** Tool akan mengerti format nama yang berbeda

## Workflow Recommendation

1. **Preview First**: Gunakan `spreadsheet_preview_matching` untuk melihat estimasi matching
2. **Dry Run**: Jalankan `spreadsheet_transfer_data` dengan `dryRun: true` untuk melihat detail mapping
3. **Execute**: Jalankan dengan `dryRun: false` untuk melakukan update

## Error Handling

Tool akan throw error jika:
- URL spreadsheet tidak valid
- Kolom unique tidak ditemukan
- API Key tidak valid
- Permission Google Sheets tidak cukup
- OpenAI API error

## Best Practices

1. **Selalu Preview**: Gunakan preview dan dry-run terlebih dahulu
2. **Confidence Threshold**: Gunakan threshold 0.8+ untuk data penting
3. **Review Unmatched**: Periksa data yang tidak ter-match
4. **Backup**: Download backup spreadsheet sebelum melakukan update
5. **Batch Size**: Jika data sangat besar (>1000 rows), pertimbangkan untuk memecah menjadi beberapa batch

## Limitations

- Google Sheets API Key hanya bisa mengakses spreadsheet public atau yang di-share ke service account
- Rate limiting oleh Google Sheets API (500 requests per 100 seconds per project)
- Rate limiting oleh OpenAI API
- Maximum row processing depends on OpenAI token limits
