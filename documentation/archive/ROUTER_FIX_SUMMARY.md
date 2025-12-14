# Router Fix Summary

## Problem Identified

**Error**: `column "production_summary.date" must appear in the GROUP BY clause or be used in an aggregate function`

**Query**: "Show me production data for April"

### Root Cause

The question was being routed to **SQL** instead of **RAG**, and the SQL generator was creating an invalid query with incorrect GROUP BY usage.

## Solution Implemented

### 1. Priority-Based Routing Rules

Updated to prefer RAG for indexed production data:

**PRIORITY 1 - RAG (Advisory/Procedural Questions)**
- Questions starting with: "how to", "how do I", "how can I", "how should I"
- Questions about: "best practice", "optimize", "improve", "reduce"
- Questions asking for: "guidelines", "procedures", "safety", "policy"

**PRIORITY 2 - RAG (Indexed Production Data)**
- Questions about "production summary" or "production data" with month names
- Examples: "show production data for April", "production in January"
- RAG handles these better because dates include month names in indexed chunks

**PRIORITY 3 - SQL (Other Data Retrieval)**
- Aggregation: "how many", "count", "total", "sum", "average"
- Real-time trips: "list trips", "show trips today"
- Equipment tracking: "show equipment"

### 2. Improved SQL Generation Rules

Added critical GROUP BY rules to prevent invalid SQL:

```sql
-- For "show data" questions: NO GROUP BY
✅ SELECT * FROM production_summary WHERE EXTRACT(MONTH FROM date) = 4

-- For aggregations with grouping: GROUP BY dimension
✅ SELECT shift, SUM(qty_ton) FROM production_summary GROUP BY shift

-- WRONG: Missing columns in GROUP BY
❌ SELECT date, shift, qty_ton FROM table GROUP BY shift
```

**Key Rules**:
- "Show data" queries → No GROUP BY, just WHERE filters
- Aggregations → GROUP BY only when grouping by dimension
- If using GROUP BY → ALL non-aggregated columns must be in GROUP BY clause

## Test Cases

### Should Route to RAG
✅ "Show me production data for April" (indexed production data with month names)
✅ "Production summary for January" (indexed data)
✅ "how to improve my production per day" (advisory question)
✅ "what is the best practice for maintenance" (advisory question)
✅ "how to optimize haul routes" (advisory question)

### Should Route to SQL
✅ "how many trips today" (real-time trips data)
✅ "total tonnage by shift" (aggregation with GROUP BY)
✅ "list equipment" (equipment table)
✅ "show trips by dump yard" (trips data with grouping)

## Files Modified

- `src/services/router.ts`
  - Updated routing prompt with priority-based rules
  - Added more specific examples
  - Improved fallback heuristic logic

## Verification

The fix has been built successfully. Test in the application by asking:
1. "Show me production data for April" → Should route to **RAG** ✅
2. "how many trips today" → Should route to **SQL** ✅
3. "total production by shift" → Should route to **SQL** with valid GROUP BY ✅
4. "how to improve production" → Should route to **RAG** ✅

## Expected Behavior

### Before Fix
- ❌ "Show production data for April" → SQL route
- ❌ Invalid GROUP BY query generated
- ❌ Database error: column must appear in GROUP BY clause
- ❌ No results returned

### After Fix
- ✅ "Show production data for April" → RAG route
- ✅ Searches indexed production chunks with month names
- ✅ Returns formatted results with proper date understanding
- ✅ No SQL errors

## Why This Works Better

1. **RAG for Production Data**:
   - 521 chunks indexed with dates formatted as "2025-04-01 (April 1, 2025)"
   - AI correctly understands month 04 = April
   - Semantic search handles date queries naturally

2. **SQL for Calculations**:
   - Still used for aggregations and real-time data
   - Improved GROUP BY rules prevent errors
   - Clear guidance on when to use GROUP BY

3. **Better User Experience**:
   - Natural language answers from RAG
   - Accurate data retrieval without SQL errors
   - Proper month/date understanding
