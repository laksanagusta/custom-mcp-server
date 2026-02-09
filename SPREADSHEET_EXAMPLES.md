# Spreadsheet Tool Usage Examples

## Example 1: Basic City Name Matching

Transfer population data from source to master spreadsheet.

### Master Spreadsheet (Before)
| Kota | Populasi | Last Updated |
|------|----------|--------------|
| kota Surabaya | | |
| kota Jakarta | | |
| kota Bandung | | |

### Source Spreadsheet
| Nama Wilayah | Populasi 2024 | Sumber |
|--------------|---------------|--------|
| Surabaya | 2900000 | BPS |
| DKI Jakarta | 10500000 | BPS |
| Bandung | 2500000 | BPS |

### Request

```json
{
  "masterSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/MASTER_ID/edit",
  "sourceSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/SOURCE_ID/edit",
  "masterUniqueColumn": "Kota",
  "sourceUniqueColumn": "Nama Wilayah",
  "valueColumns": [
    {
      "sourceColumn": "Populasi 2024",
      "masterColumn": "Populasi",
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

### Expected Result

Tool akan mengerti:
- "kota Surabaya" ≈ "Surabaya" (confidence: 0.95)
- "kota Jakarta" ≈ "DKI Jakarta" (confidence: 0.90)
- "kota Bandung" ≈ "Bandung" (confidence: 0.95)

### Master Spreadsheet (After)
| Kota | Populasi | Last Updated |
|------|----------|--------------|
| kota Surabaya | 2900000 | [timestamp] |
| kota Jakarta | 10500000 | [timestamp] |
| kota Bandung | 2500000 | [timestamp] |

---

## Example 2: Product Code Matching

Transfer product prices from inventory system.

### Master Spreadsheet (Before)
| Product Code | Product Name | Price | Stock |
|--------------|--------------|-------|-------|
| PRD-A123 | Widget A | | 100 |
| PRD-B456 | Widget B | | 50 |
| PRD-C789 | Widget C | | 200 |

### Source Spreadsheet
| SKU | Unit Price | Currency |
|-----|------------|----------|
| A123 | 50000 | IDR |
| B456 | 75000 | IDR |
| C789 | 60000 | IDR |

### Request

```json
{
  "masterSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/MASTER_ID/edit",
  "sourceSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/SOURCE_ID/edit",
  "masterUniqueColumn": "Product Code",
  "sourceUniqueColumn": "SKU",
  "valueColumns": [
    {
      "sourceColumn": "Unit Price",
      "masterColumn": "Price",
      "operation": "update"
    }
  ],
  "options": {
    "dryRun": false,
    "confidenceThreshold": 0.85
  }
}
```

### Expected Result

Tool akan mengerti:
- "PRD-A123" ≈ "A123" (confidence: 0.92)
- "PRD-B456" ≈ "B456" (confidence: 0.92)
- "PRD-C789" ≈ "C789" (confidence: 0.92)

---

## Example 3: Name Matching with Different Formats

Transfer email addresses with name format variations.

### Master Spreadsheet (Before)
| Full Name | Email | Department |
|-----------|-------|------------|
| John Smith Jr. | | Engineering |
| Jane Doe | | Marketing |
| Robert Johnson | | Sales |

### Source Spreadsheet
| Name | Email Address | Phone |
|------|---------------|-------|
| Smith, John | john.smith@company.com | +1234567890 |
| Doe, Jane | jane.doe@company.com | +1234567891 |
| Johnson, Robert | r.johnson@company.com | +1234567892 |

### Request

```json
{
  "masterSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/MASTER_ID/edit",
  "sourceSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/SOURCE_ID/edit",
  "masterUniqueColumn": "Full Name",
  "sourceUniqueColumn": "Name",
  "valueColumns": [
    {
      "sourceColumn": "Email Address",
      "masterColumn": "Email",
      "operation": "update"
    }
  ],
  "options": {
    "dryRun": true,
    "confidenceThreshold": 0.75
  }
}
```

### Expected Result

Tool akan mengerti format nama yang berbeda:
- "John Smith Jr." ≈ "Smith, John" (confidence: 0.88)
- "Jane Doe" ≈ "Doe, Jane" (confidence: 0.92)
- "Robert Johnson" ≈ "Johnson, Robert" (confidence: 0.92)

---

## Example 4: Multiple Column Transfer

Transfer multiple fields at once.

### Request

```json
{
  "masterSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/MASTER_ID/edit",
  "sourceSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/SOURCE_ID/edit",
  "masterUniqueColumn": "ID",
  "sourceUniqueColumn": "ProductID",
  "valueColumns": [
    {
      "sourceColumn": "Price",
      "masterColumn": "UnitPrice",
      "operation": "update"
    },
    {
      "sourceColumn": "Stock",
      "masterColumn": "Quantity",
      "operation": "update"
    },
    {
      "sourceColumn": "Category",
      "masterColumn": "ProductCategory",
      "operation": "update"
    }
  ],
  "options": {
    "dryRun": false,
    "confidenceThreshold": 0.8
  }
}
```

---

## Example 5: Dry Run Mode

Always test dengan dry-run terlebih dahulu!

### Request (Dry Run)

```json
{
  "masterSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/MASTER_ID/edit",
  "sourceSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/SOURCE_ID/edit",
  "masterUniqueColumn": "Kota",
  "sourceUniqueColumn": "Nama Wilayah",
  "valueColumns": [
    {
      "sourceColumn": "Populasi",
      "masterColumn": "JumlahPenduduk",
      "operation": "update"
    }
  ],
  "options": {
    "dryRun": true,
    "confidenceThreshold": 0.8
  }
}
```

### Response

```json
{
  "success": true,
  "dryRun": true,
  "summary": {
    "totalMasterRows": 50,
    "totalSourceRows": 48,
    "matched": 45,
    "unmatched": 3,
    "averageConfidence": 0.91
  },
  "mappings": [
    {
      "masterValue": "kota Surabaya",
      "sourceValue": "Surabaya",
      "confidence": 0.95,
      "valuesToTransfer": {
        "JumlahPenduduk": 2900000
      }
    }
  ],
  "unmatched": [
    {
      "sourceValue": "Kota X",
      "sourceRowIndex": 10,
      "reason": "No matching master value found",
      "bestCandidate": {
        "value": "kota Surabaya",
        "confidence": 0.45
      }
    }
  ]
}
```

**Note**: Spreadsheet tidak akan di-update karena `dryRun: true`

---

## Example 6: Preview Matching

Gunakan untuk estimasi sebelum melakukan transfer.

### Request

```json
{
  "masterSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/MASTER_ID/edit",
  "sourceSpreadsheetUrl": "https://docs.google.com/spreadsheets/d/SOURCE_ID/edit",
  "masterUniqueColumn": "Kota",
  "sourceUniqueColumn": "Wilayah",
  "matchModel": "gpt-4o-mini"
}
```

### Response

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
        "reasoning": "Same city with prefix variation"
      }
    ],
    "estimatedAccuracy": 0.90
  }
}
```

---

## Tips & Best Practices

### 1. Workflow yang Disarankan

```
1. Preview → 2. Dry Run → 3. Execute
```

### 2. Confidence Threshold Guidelines

- **0.9+**: Sangat aman, hampir tidak ada false positive
- **0.8-0.9**: Aman untuk kebanyakan kasus
- **0.7-0.8**: Perlu review manual
- **< 0.7**: Tidak disarankan untuk production

### 3. Handling Unmatched Items

Setelah transfer, periksa daftar `unmatched`:

```json
{
  "unmatched": [
    {
      "sourceValue": "Kota X",
      "reason": "No matching master value found",
      "bestCandidate": {
        "value": "kota Y",
        "confidence": 0.45
      }
    }
  ]
}
```

**Actions:**
- Jika `bestCandidate.confidence` rendah: Data memang berbeda
- Jika `bestCandidate.confidence` tinggi: Mungkin typo atau varian

### 4. Common Issues

**Issue**: "Invalid Google Sheets URL"
**Solution**: Pastikan URL dalam format:
- `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
- `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0`

**Issue**: "Spreadsheet is empty"
**Solution**: Pastikan spreadsheet memiliki data dan header row

**Issue**: Low match confidence
**Solution**: 
- Turunkan `confidenceThreshold` (dengan risiko lebih banyak false positive)
- Periksa data untuk inconsistency
- Gunakan model yang lebih powerful (gpt-4o)

### 5. Performance Tips

- **Batch Size**: Untuk data >1000 rows, pertimbangkan chunking
- **Model Selection**:
  - `gpt-4o-mini`: Cepat & murah, cocok untuk kebanyakan kasus
  - `gpt-4o`: Lebih akurat untuk matching kompleks
- **Dry Run First**: Selalu test sebelum update production data
