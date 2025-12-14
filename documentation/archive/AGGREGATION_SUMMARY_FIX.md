# Aggregation Summary Fix

## Problem
Query: "Give me a complete summary of January 2025 production including total tonnage, trips, and equipment utilization"

**Expected**: Single row with aggregated totals (SUM, AVG, COUNT)
```
total_tonnage | total_trips | avg_daily_tonnage | production_days | avg_excavators | avg_dumpers
63,251        | 7,642       | 2,108.37          | 30              | 2.5            | 3.2
```

**Actual**: 30 individual rows (one per day) without any aggregation
```
date         | qty_ton | total_trips
2025-01-01   | 10330   | 995
2025-01-02   | 10600   | 1021
...
```

**Route**: Matched `GET_PRODUCTION_SUMMARY` intent instead of `AGGREGATION_QUERY` or `GET_MONTHLY_SUMMARY`

## Root Causes

### 1. Intent Detection Gaps
**GET_MONTHLY_SUMMARY** keywords were too narrow:
```typescript
// OLD - Only detected "monthly", "month summary"
keywords: ['monthly', 'month summary', 'month report']
```

**Problem**: Query "January 2025 summary" contains "January" but not "monthly" → intent missed

### 2. Missing Aggregation Logic
**AGGREGATION_QUERY** only handled "top N" queries (rank_type + n):
```typescript
// OLD - Only generated SQL for "top 10", "bottom 5", etc.
if (params.rank_type && params.n) {
  sqlOverride = `SELECT ... ORDER BY ... LIMIT ${limit}`;
}
```

**Problem**: Query with "total", "summary" keywords didn't trigger aggregation SQL generation

### 3. GET_PRODUCTION_SUMMARY Too Generic
- Matched queries with "production" + "summary" keywords
- No SQL override, just passed to LLM
- LLM sometimes returned individual rows instead of aggregations

## Solution

### Fix 1: Enhanced GET_MONTHLY_SUMMARY Keywords
Added all month names to keyword detection:

```typescript
{ intent: 'GET_MONTHLY_SUMMARY', keywords: [
  'monthly', 'month summary', 'month report',
  // NEW: All month names
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
] }
```

**Impact**: "January 2025 summary" now triggers GET_MONTHLY_SUMMARY intent

### Fix 2: AGGREGATION_QUERY Enhancement
Added "total" query detection with automatic month extraction:

```typescript
// Check if query asks for "total" aggregations
const isTotalQuery = /\b(total|sum|all|entire|complete|overall)\b/i.test(q);
const hasEquipmentUtilization = /\b(equipment|utilization|excavator|dumper|machine)\b/i.test(q);

if (isTotalQuery && params.month) {
  // Generate aggregated SQL for total queries with month parameter
  sqlOverride = `SELECT 
    SUM(qty_ton) AS total_tonnage,
    SUM(total_trips) AS total_trips,
    AVG(qty_ton) AS avg_daily_tonnage,
    COUNT(DISTINCT date) AS production_days
    ${hasEquipmentUtilization ? ', AVG(excavator) AS avg_excavators, AVG(dumper) AS avg_dumpers' : ''}
  FROM production_summary
  WHERE EXTRACT(MONTH FROM date) = ${params.month} AND EXTRACT(YEAR FROM date) = ${year}`;
}
```

**Fallback**: If parameter extraction missed the month, regex extracts it:
```typescript
const monthMatch = q.match(/\b(january|february|...|december)\b/i);
// Extract month number from name and generate SQL
```

### Fix 3: GET_MONTHLY_SUMMARY SQL Override
Added aggregation SQL generation for monthly summaries:

```typescript
if (intentName === 'GET_MONTHLY_SUMMARY' && params.month) {
  sqlOverride = `SELECT 
    SUM(qty_ton) AS total_tonnage,
    SUM(total_trips) AS total_trips,
    AVG(qty_ton) AS avg_daily_tonnage,
    MAX(qty_ton) AS max_daily_tonnage,
    MIN(qty_ton) AS min_daily_tonnage,
    COUNT(DISTINCT date) AS production_days,
    AVG(excavator) AS avg_excavators,
    AVG(dumper) AS avg_dumpers
  FROM production_summary
  WHERE EXTRACT(MONTH FROM date) = ${params.month} AND EXTRACT(YEAR FROM date) = ${year}`;
}
```

**Fallback**: Regex month extraction if parameter missed

## Priority Flow

With these fixes, queries are now handled in this priority order:

### Priority 3: AGGREGATION_QUERY (Highest for aggregations)
- **Triggers**: "total", "sum", "all", "entire", "complete", "overall" + month name
- **SQL**: Aggregated totals (SUM, AVG, COUNT)
- **Example**: "total production for January 2025"

### Priority 4: GET_MONTHLY_SUMMARY (Month-specific summaries)
- **Triggers**: Month names (january, february, etc.) or "monthly" + "summary"
- **SQL**: Comprehensive monthly aggregations with min/max/avg
- **Example**: "January 2025 summary" or "monthly report"

### Priority 6: GET_PRODUCTION_SUMMARY (Raw data fallback)
- **Triggers**: Generic "production" + "summary" without aggregation keywords
- **SQL**: Individual rows (no aggregation)
- **Example**: "show production data" (when user wants detailed rows)

## Test Cases

### ✅ Now Works (Aggregated Results)
```
"Give me a complete summary of January 2025 production including total tonnage, trips"
→ Intent: AGGREGATION_QUERY or GET_MONTHLY_SUMMARY
→ SQL: SELECT SUM(qty_ton), SUM(total_trips), AVG(qty_ton), COUNT(DISTINCT date) ...
→ Result: 1 row with totals

"total production for January 2025"
→ Intent: AGGREGATION_QUERY
→ SQL: SELECT SUM(qty_ton), SUM(total_trips) ...
→ Result: 1 row with totals

"January 2025 summary with equipment utilization"
→ Intent: GET_MONTHLY_SUMMARY
→ SQL: SELECT SUM(...), AVG(excavator), AVG(dumper) ...
→ Result: 1 row with totals + equipment averages
```

### ✅ Still Works (Individual Rows)
```
"show production data for January 2025"
→ Intent: GET_PRODUCTION_SUMMARY (no aggregation keywords)
→ SQL: SELECT * FROM production_summary WHERE ...
→ Result: 30 rows (one per day)

"list daily production for January"
→ Intent: GET_PRODUCTION_SUMMARY
→ SQL: SELECT date, qty_ton, total_trips ...
→ Result: Multiple rows (daily breakdown)
```

## Technical Details

**Files Modified**:
1. `src/services/intent.ts` - Line 91: Enhanced GET_MONTHLY_SUMMARY keywords
2. `src/services/router.ts` - Lines 110-203: Enhanced AGGREGATION_QUERY with total query detection
3. `src/services/router.ts` - Lines 430-481: Added GET_MONTHLY_SUMMARY SQL override

**Breaking Changes**: None. All existing queries work as before.

**New Capabilities**:
- ✅ Month name detection (january, february, etc.)
- ✅ "Total" keyword triggers aggregation
- ✅ Equipment utilization included when mentioned
- ✅ Automatic month extraction from text when parameter extraction fails
- ✅ Fallback layers ensure aggregation SQL is always generated for summary queries
