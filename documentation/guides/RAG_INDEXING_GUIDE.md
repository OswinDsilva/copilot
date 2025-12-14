# RAG Indexing from Database Tables

## Overview
You can now build a RAG (Retrieval-Augmented Generation) index directly from any database table. This allows the co-pilot to answer questions using the data stored in your database tables.

## Features
- **Direct Database Integration**: Index data directly from any database table
- **Table Selection**: Choose which table to index (production_summary, trips, equipment)
- **Customizable Settings**: Configure chunk size, overlap, and top-K parameters
- **Date-Aware**: Dates are formatted with month names (e.g., "2025-04-01 (April 1, 2025)") so the AI correctly understands that month 04 = April
- **One-Click Indexing**: Simple dropdown + button to trigger the entire process

## How to Use

### Step 1: Configure RAG Settings
1. Go to **Settings** → **Configuration**
2. Set your desired parameters:
   - **Row Chunk Size**: 1 (recommended for database tables - each row becomes one chunk)
   - **Chunk Overlap**: 0 (no overlap needed for discrete records)
   - **Top-K**: 50 (retrieve up to 50 relevant records per query)
3. Ensure your **OpenAI API Key** is configured
4. Click **Save Settings**

### Step 2: Select and Index Database Table
1. Go to **Settings** → **Data** tab
2. Use the **dropdown** to select which table to index:
   - **Production Summary** (production_summary table)
   - **Trips** (trips table)
   - **Equipment** (equipment table)
3. Click the **"Index to RAG"** button (green button)
4. Wait for the indexing process to complete
5. You'll see a success notification when done

### Step 3: Query the Data
1. Go to the **Chat** tab
2. Ask questions about the indexed data, for example:
   - "Show me production data for April"
   - "What was the total production in May?"
   - "Compare production between shift A and shift B"
   - "Show me trips data from last week"
   - "List all equipment"

## Technical Details

### What Gets Indexed
For **Production Summary** table:
- All 822 rows from the production_summary table
- Each row includes: date, shift, excavator, dumper, trip counts, quantities, totals
- Dates are automatically formatted with month names for better AI understanding

For **Trips** table:
- All trip records with dump yard, equipment, material, quantity information

For **Equipment** table:
- All equipment records with status and location information

### RAG Namespace
- Data is stored in a namespace matching the table name
- File record name: `{table_name}_database`
- Example: `production_summary_database`, `trips_database`, `equipment_database`

### Date Handling
The system now correctly understands that:
- Month 01 = January
- Month 02 = February
- Month 03 = March
- Month 04 = April
- And so on...

This fixes the issue where `2025-04-01` was being misinterpreted as January instead of April.

### Re-indexing
If you need to update the RAG index with new data:
1. Load new data into the database table
2. Select the table from the dropdown
3. Click "Index to RAG" again
4. The old index will be cleared and replaced with the new data

## Settings Recommendations

For database tables with many records:
- **Chunk Size**: 1 (each record is independent)
- **Overlap**: 0 (no overlap needed)
- **Top-K**: 50 (retrieve more context for better answers)
- **Vector Store**: pgvector (for Supabase integration)

## Troubleshooting

**Issue**: "Could not find the 'file_size' column"
- **Solution**: Fixed! The system now uses the correct `size_bytes` column.

**Issue**: No data found when querying
- **Solution**: Ensure the indexing completed successfully. Check that the file appears in the Data tab with status "ready"

**Issue**: Wrong month interpretation (e.g., April showing as January)
- **Solution**: This has been fixed. Re-index the table to apply the date formatting fixes

**Issue**: Slow indexing
- **Solution**: Normal for large tables. Each record needs to be embedded using OpenAI API. Expect 2-5 minutes for full indexing of 822 records.

**Issue**: Want to index a different table
- **Solution**: Simply select the table from the dropdown and click "Index to RAG". You can index multiple tables and they'll each have their own namespace.
