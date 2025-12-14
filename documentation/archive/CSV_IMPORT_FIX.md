# CSV Import Fix - Dual Storage Implementation

## Problem Identified

When you uploaded a production_summary.csv file:
- ✓ File was uploaded successfully to storage
- ✓ RAG chunks were created (330 records)
- ✗ **production_summary table remained EMPTY** (0 records)

The data was only going to RAG for document search, but NOT to the database table for SQL queries.

## Root Cause

### Issue 1: Table Detection Priority
The original detection logic prioritized "trips" table over "production_summary":
```typescript
// OLD - Wrong priority order
if (tripScore > 0.4) return 'trips';
if (productionScore > 0.5) return 'production_summary';
```

Production summary CSVs with columns like 'excavator', 'dumper', 'shift' were matching the trip detection first.

### Issue 2: Wrong Column Headers for Detection
The production headers definition didn't match the actual table structure:
```typescript
// OLD - Wrong headers
const productionHeaders = ['date', 'shift', 'dump_yard', 'total_tonnage', 'trip_count'];

// ACTUAL production_summary table has:
// date, shift, excavator, dumper, trip_count_for_mining, qty_ton,
// trip_count_for_reclaim, qty_m3, total_trips, grader, dozer
```

### Issue 3: Missing Debug Logging
No console logs to see what was happening during detection and import.

## Solution Implemented

### 1. Fixed Table Detection Logic

**Updated detection order** (csvImporter.ts:13-37):
```typescript
// Check production_summary FIRST (more specific columns)
if (productionScore > 0.4) return 'production_summary';
if (tripScore > 0.4) return 'trips';
if (equipmentScore > 0.5) return 'equipment';
```

**Updated header definitions** to match actual tables:
```typescript
const productionSummaryHeaders = [
  'date', 'shift', 'excavator', 'dumper',
  'trip_count_for_mining', 'qty_ton', 'total_trips',
  'grader', 'dozer'
];

const tripHeaders = [
  'trip_number', 'date', 'time', 'dump_yard',
  'equipment', 'material', 'quantity'
];
```

### 2. Added Comprehensive Column Mapping

Extended mapping to support all table types (csvImporter.ts:70-88):
```typescript
const columnMapping: Record<string, string> = {
  // Production summary columns
  'date': 'date',
  'shift': 'shift',
  'excavator': 'excavator',
  'dumper': 'dumper',
  'trip_count_for_mining': 'trip_count_for_mining',
  'qty_ton': 'qty_ton',
  'qty_(ton)': 'qty_ton',
  'trip_count_for_reclaim': 'trip_count_for_reclaim',
  'qty_m3': 'qty_m3',
  'qty_(m3)': 'qty_m3',
  'total_trips': 'total_trips',
  'grader': 'grader',
  'dozer': 'dozer',

  // Trips columns
  'trip_number': 'trip_number',
  'time': 'time',
  'dump_yard': 'dump_yard',
  'equipment': 'equipment',
  'material': 'material',
  'quantity': 'quantity'
};
```

### 3. Enhanced Data Type Handling

Improved value parsing for numbers vs strings (csvImporter.ts:104-120):
```typescript
if (value !== null && value !== undefined && value !== '') {
  if (typeof value === 'number' || !isNaN(parseFloat(value))) {
    mapped[normalizedKey] = value;
  } else if (typeof value === 'string') {
    mapped[normalizedKey] = value.trim();
  } else {
    mapped[normalizedKey] = value;
  }
}
```

### 4. Extended Duplicate Detection

Updated to work for both trips AND production_summary (csvImporter.ts:144-181):
```typescript
if (tableName === 'trips' || tableName === 'production_summary') {
  // Check for existing date+shift combinations
  // Skip duplicate imports
  // Log how many duplicates were filtered
}
```

### 5. Added Debug Logging

Added console logs at key points:
- Table detection with scores
- Target table name
- Sample rows before/after mapping
- Total rows to import
- Duplicate filtering results

## How It Works Now

### Upload Flow:
1. **File Upload** → Stored in Supabase storage
2. **Table Detection** → Analyzes CSV headers to determine target table
3. **Database Import** → Maps and inserts data into the appropriate table
   - Handles duplicates (skips existing date+shift combinations)
   - Validates data types
   - Imports in batches of 100 rows
4. **RAG Indexing** → Creates searchable chunks for document queries
5. **Status Update** → File marked as "ready" with import summary

### Dual Storage:
- **SQL Queries** → Query the database tables directly (trips, production_summary, equipment)
- **RAG Queries** → Search through document chunks for context-based questions

## Tables Supported

### 1. production_summary
**Columns:** date, shift, excavator, dumper, trip_count_for_mining, qty_ton, trip_count_for_reclaim, qty_m3, total_trips, grader, dozer

**Detection:**
- Headers match production columns (>40% match)
- OR filename contains "production"

**Example:** production_summary.csv, Production Report.xlsx

### 2. trips
**Columns:** trip_number, date, time, dump_yard, shift, equipment, material, quantity

**Detection:**
- Headers match trip columns (>40% match)
- OR filename contains "trip" or "export"

**Example:** trips_export.csv, Daily Trips.xlsx

### 3. equipment
**Columns:** equipment_id, equipment_type, status, location

**Detection:**
- Headers match equipment columns (>50% match)
- OR filename contains "equipment"

**Example:** equipment_list.csv

## Testing Instructions

### To Test the Fix:

1. **Delete existing file record** (optional, to retest):
   ```sql
   DELETE FROM uploaded_files WHERE filename = 'production_summary.csv';
   DELETE FROM rag_chunks WHERE file_id = '99a5283f-de34-4120-ae72-5e70a3f35ce8';
   ```

2. **Re-upload your production_summary.csv** in the Settings tab

3. **Check browser console** for debug logs:
   - Should see: "CSV Detection" with scores
   - Should see: "Importing to table: production_summary"
   - Should see: "Total rows to import: X"

4. **Verify data in database**:
   ```sql
   SELECT COUNT(*) FROM production_summary;
   SELECT * FROM production_summary LIMIT 5;
   ```

5. **Verify data in RAG**:
   ```sql
   SELECT COUNT(*) FROM rag_chunks WHERE namespace LIKE '%production%';
   ```

6. **Test SQL queries** in Chat:
   - "How many production records do we have?"
   - "Show me production summary for day shift"
   - "What was the total tonnage?"

7. **Test RAG queries** in Chat:
   - "What does the production data show?"
   - "Tell me about excavator usage"

## Expected Results

After uploading production_summary.csv with (for example) 11 rows:

- **uploaded_files table**: 1 record, status='ready', progress=100
- **production_summary table**: 11 records (actual data rows)
- **rag_chunks table**: ~330+ chunks (for document search)

Both query types should now work:
- **SQL**: Direct database queries for structured data
- **RAG**: Context-based questions about the data

## Files Modified

1. **src/services/csvImporter.ts**
   - Fixed table detection priority and headers
   - Enhanced column mapping for all table types
   - Added comprehensive logging
   - Extended duplicate detection
   - Improved data type handling

## Verification Queries

Run these to verify everything is working:

```sql
-- Check file upload status
SELECT filename, status, progress, doc_count, error_message
FROM uploaded_files
ORDER BY uploaded_at DESC;

-- Check production_summary data
SELECT COUNT(*) as total_rows FROM production_summary;
SELECT date, shift, excavator, dumper, total_trips
FROM production_summary
ORDER BY date DESC
LIMIT 5;

-- Check RAG chunks
SELECT COUNT(*) as chunk_count FROM rag_chunks;
SELECT namespace, COUNT(*) as count
FROM rag_chunks
GROUP BY namespace;

-- Check for errors
SELECT * FROM uploaded_files WHERE status = 'error';
```

## Benefits

✓ Data available for both SQL and RAG queries
✓ Automatic table detection based on CSV structure
✓ Duplicate prevention (won't reimport same date+shift)
✓ Better debugging with console logs
✓ Supports multiple table types
✓ Handles various column name formats
✓ Proper data type conversion
