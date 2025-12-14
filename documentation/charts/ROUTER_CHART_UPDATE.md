# Router Update for Chart/Visualization Questions

## Problem
The question "Overlay a average line on this graph for Jan 2025 QTY TON" was being routed to RAG instead of SQL, causing the error "Not enough evidence found in the uploaded documents."

This happened because:
1. Router didn't prioritize visualization keywords (graph, chart, overlay)
2. Router didn't detect "average line" as requiring SQL calculation
3. RAG can't perform calculations or generate chart data

## Solution
Updated the router to **prioritize SQL for all visualization and calculation questions**.

## Changes Made

### 1. New Priority Order

**Before**:
1. Advisory/procedural questions → RAG
2. Production data queries → RAG
3. Other data retrieval → SQL

**After**:
1. **Visualization/chart questions → SQL** ⭐ NEW
2. **Calculations/aggregations → SQL** ⭐ NEW
3. Advisory/procedural questions → RAG
4. Data retrieval → SQL

### 2. Visualization Detection

Added keywords that trigger SQL routing:
- **Chart types**: graph, chart, plot, visualize, visualization, draw
- **Actions**: overlay, show on graph, plot over time, chart by
- **Chart elements**: bar chart, line graph, pie chart, histogram
- **Trend lines**: average line, mean line, trend line, overlay average

### 3. Calculation Detection

Enhanced detection for aggregation questions:
- **Averages**: average, mean, median
- **Totals**: sum, total, count
- **Calculations**: calculate, compute, max, min
- **Comparisons**: highest, lowest, top, bottom, most, least

### 4. Fallback Heuristic

Updated fallback logic when OpenAI router fails:

```typescript
const isVisualization = /\b(graph|chart|plot|overlay|average line|mean line)\b/i.test(question);
const isCalculation = /\b(average|mean|sum|total|count|calculate|max|min)\b/i.test(question);

if (isVisualization || isCalculation) {
  task = 'sql';  // Always use SQL for charts/calculations
}
```

### 5. SQL Generator Enhancement

Added guidance for window functions:

```sql
-- For "overlay average line on graph for Jan 2025"
SELECT
  date,
  qty_ton,
  AVG(qty_ton) OVER () as avg_qty_ton
FROM production_summary
WHERE EXTRACT(YEAR FROM date) = 2025 AND EXTRACT(MONTH FROM date) = 1
ORDER BY date
```

**Key points**:
- Uses `AVG(...) OVER ()` to calculate average across all rows
- Returns detail data PLUS average in same result set
- No GROUP BY (preserves individual data points)
- Perfect for overlaying average line on charts

## How It Works Now

### Question: "Overlay average line on graph for Jan 2025 QTY TON"

**Step 1: Router Analysis**
```
Keywords detected: "overlay", "average", "line", "graph"
→ Matches PRIORITY 1: VISUALIZATION/CHART
→ Decision: task = "sql"
→ Confidence: High
```

**Step 2: SQL Generation**
```sql
SELECT
  date,
  qty_ton,
  AVG(qty_ton) OVER () as avg_qty_ton
FROM production_summary
WHERE EXTRACT(YEAR FROM date) = 2025
  AND EXTRACT(MONTH FROM date) = 1
ORDER BY date
```

**Step 3: Query Execution**
Returns data like:
```
date       | qty_ton | avg_qty_ton
-----------|---------|------------
2025-01-01 | 1200    | 1150
2025-01-02 | 1100    | 1150
2025-01-03 | 1150    | 1150
...
```

**Step 4: Visualization**
- Frontend plots qty_ton as line/bars
- Overlays avg_qty_ton as horizontal line
- Shows both actual data and average

## Supported Questions

### ✅ Now Routes to SQL

**Visualization Questions**:
- "Overlay average line on graph for Jan 2025 QTY TON"
- "Show bar chart of production by shift"
- "Graph production over time"
- "Plot tonnage by date"
- "Draw a line chart for April data"
- "Visualize equipment usage"

**Calculation Questions**:
- "Calculate average tonnage"
- "What is the mean production"
- "Find the highest production day"
- "Sum total trips by shift"
- "Count trips per equipment"
- "Compare shift A vs shift B average"

**Aggregation Questions**:
- "Total QTY TON for January"
- "Average production per day"
- "Max tonnage in a single trip"
- "Min production in April"

### ✅ Still Routes to RAG

**Advisory Questions**:
- "How to improve production efficiency"
- "What is the best practice for maintenance"
- "How can I optimize haul routes"
- "Safety guidelines for equipment"

## Testing

### Test Case 1: Original Problem
**Question**: "Overlay average line on graph for Jan 2025 QTY TON"

**Expected Result**:
- ✅ Routes to SQL
- ✅ Generates query with window function
- ✅ Returns data with avg_qty_ton column
- ✅ Frontend can plot both values

### Test Case 2: Other Chart Questions
**Question**: "Show bar chart of production by shift"

**Expected Result**:
- ✅ Routes to SQL
- ✅ Generates GROUP BY query
- ✅ Returns aggregated data
- ✅ Perfect for bar chart

### Test Case 3: Simple Average
**Question**: "What is the average QTY TON for January"

**Expected Result**:
- ✅ Routes to SQL
- ✅ Uses AVG() function
- ✅ Returns single number
- ✅ No RAG search needed

### Test Case 4: Advisory Still Works
**Question**: "How to improve equipment utilization"

**Expected Result**:
- ✅ Routes to RAG
- ✅ Searches documents
- ✅ Returns best practices
- ✅ SQL not needed

## Debug Console Logs

When you ask a chart question, you'll see:

```
[Routing Decision] {
  task: 'sql',
  confidence: 0.95,
  reason: 'Visualization question requiring SQL calculation',
  keywords: ['overlay', 'average', 'line', 'graph'],
  ...
}
```

If router fails, fallback will catch it:
```
[Routing Decision] {
  task: 'sql',
  confidence: 0.5,
  reason: 'Router failed, detected visualization/calculation query via fallback heuristic',
  ...
}
```

## Benefits

### For Users
1. **Chart questions work**: No more "not enough evidence" errors
2. **Faster responses**: SQL is faster than RAG for calculations
3. **Accurate data**: Database calculations are precise
4. **Better visualizations**: Window functions enable complex charts

### For System
1. **Smarter routing**: Prioritizes based on question type
2. **Better fallback**: Catches visualization keywords even if OpenAI fails
3. **Clearer logic**: Priority order is explicit and documented
4. **More examples**: Router prompt has specific chart examples

## Window Functions Explained

### What Are Window Functions?

Window functions calculate across a set of rows **without grouping them**.

**Without window function** (GROUP BY):
```sql
SELECT shift, AVG(qty_ton)
FROM production_summary
GROUP BY shift
-- Returns: 1 row per shift with average
```

**With window function** (OVER):
```sql
SELECT date, shift, qty_ton, AVG(qty_ton) OVER ()
FROM production_summary
-- Returns: ALL rows with average in each row
```

### Why Use Window Functions for Charts?

**Problem**: GROUP BY loses detail data
- Can't plot individual points
- Can't overlay average on detail chart

**Solution**: Window functions keep detail + add calculation
- Plot qty_ton for each date (bars/points)
- Overlay avg_qty_ton as line (constant value)
- Both on same chart!

### Window Function Syntax

```sql
AVG(column) OVER ()  -- Average of all rows
AVG(column) OVER (PARTITION BY shift)  -- Average per shift
SUM(column) OVER (ORDER BY date)  -- Running total
```

For simple overlay: Use `OVER ()` with no partition

## Files Modified

1. **src/services/router.ts**
   - Added PRIORITY 1: Visualization/Chart detection
   - Added PRIORITY 2: Calculation/Aggregation detection
   - Updated examples with chart questions
   - Enhanced fallback heuristic
   - Added window function guidance for SQL generator

## Migration Notes

**No breaking changes**:
- Existing RAG queries still work
- Advisory questions still go to RAG
- SQL queries still work as before
- Only chart/calculation routing improved

**Better routing**:
- More questions now correctly use SQL
- Fewer "not enough evidence" errors
- Better support for visualizations
- Accurate calculations

## Future Enhancements

### Potential Improvements
1. **Chart type detection**: Detect bar vs line vs pie
2. **Multiple metrics**: Handle "show X and Y on same chart"
3. **Time series**: Better detection of time-based charts
4. **Drill-down**: Support "show detail by clicking"
5. **Custom aggregations**: Percentiles, moving averages

## Summary

✅ Router now prioritizes SQL for visualization questions
✅ Detects chart/graph keywords automatically
✅ Uses window functions for average lines
✅ Better fallback detection
✅ More accurate routing decisions
✅ Comprehensive examples in prompt
✅ Built and tested successfully

**Your question "Overlay average line on graph for Jan 2025 QTY TON" will now work correctly and route to SQL!**
