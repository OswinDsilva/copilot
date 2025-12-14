# Multi-Series Chart Support Update

## Problem
The question "have shift A, B, C production data with different color so that its easy to see the difference" was not being answered correctly by either RAG or SQL.

**Issues**:
1. Router didn't detect "with different colors" as a visualization pattern
2. SQL generator didn't know how to structure multi-series chart queries
3. No guidance on including grouping columns (shift, equipment, etc.)

## Solution
Updated the router to detect and properly handle **multi-series chart questions** where data should be grouped and color-coded by categories (shifts, equipment, etc.).

## Changes Made

### 1. Router Detection Enhanced

**Added keywords for multi-series charts**:
- "with different colors"
- "color coded"
- "separate by shift"
- "by shift"
- "by equipment"

**Updated PRIORITY 1** to include:
```
- Multi-series charts: "with different colors", "separate by shift", "by shift", "by equipment", "color coded"
```

### 2. SQL Generator Guidance

Added comprehensive guidance for 3 types of chart queries:

#### Type 1: Multi-Series Charts
**When**: User asks for "shift A, B, C with different colors"

**SQL Pattern**:
```sql
SELECT
  date,
  shift,
  qty_ton
FROM production_summary
WHERE EXTRACT(YEAR FROM date) = 2025 AND EXTRACT(MONTH FROM date) = 1
ORDER BY date, shift
```

**Key Points**:
- Include the grouping column (`shift`) in SELECT
- Return all detail rows (don't aggregate)
- Frontend will color-code each shift differently
- ORDER BY both date and grouping column

#### Type 2: Charts with Average Lines
**When**: User asks to "overlay average line"

**SQL Pattern**:
```sql
SELECT
  date,
  qty_ton,
  AVG(qty_ton) OVER () as avg_qty_ton
FROM production_summary
WHERE EXTRACT(YEAR FROM date) = 2025 AND EXTRACT(MONTH FROM date) = 1
ORDER BY date
```

**Key Points**:
- Use window function `AVG(...) OVER ()`
- Returns detail data PLUS average
- No GROUP BY (preserves individual points)

#### Type 3: Multi-Series WITH Averages
**When**: User asks for "shift A, B, C with their averages"

**SQL Pattern**:
```sql
SELECT
  date,
  shift,
  qty_ton,
  AVG(qty_ton) OVER (PARTITION BY shift) as avg_by_shift
FROM production_summary
WHERE EXTRACT(YEAR FROM date) = 2025 AND EXTRACT(MONTH FROM date) = 1
ORDER BY date, shift
```

**Key Points**:
- Include grouping column (`shift`)
- Use `PARTITION BY shift` for per-shift averages
- Returns data for all shifts with their respective averages
- Frontend can plot 6 series: A data, A avg, B data, B avg, C data, C avg

### 3. New Examples Added

**Added to router prompt**:
- "show shift A, B, C production with different colors" → task: "sql"
- "have shift A, B, C production data with different color" → task: "sql"
- "plot production separated by shift" → task: "sql"
- "color coded chart by equipment" → task: "sql"

### 4. Fallback Detection

**Enhanced regex to catch**:
```typescript
/\b(different color|color coded|separate by|by shift|by equipment)\b/i
```

If OpenAI router fails, fallback will still detect these patterns and route to SQL.

### 5. New Quick Question

**Added**: "Plot shifts with different colors"
- **Question**: "Show shift A, B, C production data with different colors for January 2025"
- **Route**: SQL
- **Purpose**: Demonstrate multi-series chart capability

Now we have **9 Quick Questions** (was 8).

## How It Works

### Question: "have shift A, B, C production data with different color"

**Step 1: Router Detection**
```
Keywords: "shift A, B, C", "different color"
→ Matches PRIORITY 1: VISUALIZATION (multi-series)
→ Decision: task = "sql"
→ Confidence: High
```

**Step 2: SQL Generation**
```sql
SELECT
  date,
  shift,
  qty_ton
FROM production_summary
WHERE EXTRACT(YEAR FROM date) = 2025
  AND EXTRACT(MONTH FROM date) = 1
ORDER BY date, shift
```

**Step 3: Data Returned**
```
date       | shift | qty_ton
-----------|-------|--------
2025-01-01 | A     | 1200
2025-01-01 | B     | 1100
2025-01-01 | C     | 1050
2025-01-02 | A     | 1250
2025-01-02 | B     | 1180
2025-01-02 | C     | 1020
...
```

**Step 4: Frontend Visualization**
The frontend (AnswerFormatter.tsx) should:
1. Group data by `shift` column
2. Create 3 separate line series:
   - Shift A (blue line)
   - Shift B (green line)
   - Shift C (orange line)
3. Plot all on same chart with legend

## Supported Questions

### ✅ Multi-Series Chart Questions

**Basic Multi-Series**:
- "have shift A, B, C production data with different color"
- "show shift A, B, C production with different colors"
- "plot production separated by shift"
- "color coded chart by equipment"
- "show production by shift with different colors"

**With Time Range**:
- "show shift production for January 2025 with different colors"
- "plot shift A, B, C for each date in January with colors"

**By Different Groupings**:
- "show excavator data with different colors"
- "plot dumper production color coded"
- "separate production by equipment with colors"

### ✅ Combined Questions

**Multi-Series + Averages**:
- "show shift A, B, C with their average lines"
- "plot shifts with different colors and their averages"
- "shift production with color coded averages"

## Expected SQL Patterns

### Simple Multi-Series
```sql
SELECT date, shift, qty_ton
FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
ORDER BY date, shift
```

### Multi-Series for QTY M3
```sql
SELECT date, shift, qty_m3
FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
ORDER BY date, shift
```

### Multi-Series with Per-Shift Averages
```sql
SELECT
  date,
  shift,
  qty_ton,
  AVG(qty_ton) OVER (PARTITION BY shift) as avg_by_shift
FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
ORDER BY date, shift
```

### By Equipment Instead of Shift
```sql
SELECT date, excavator, qty_ton
FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
ORDER BY date, excavator
```

## Frontend Requirements

For multi-series charts to work properly, the frontend needs to:

1. **Detect grouping column**: Check if result has columns like `shift`, `equipment`, `excavator`, `dumper`
2. **Group data**: Split results by the grouping column value
3. **Create multiple series**: One series per group
4. **Assign colors**: Different color for each series
5. **Show legend**: Display which color represents which group

**Example using Recharts**:
```tsx
// Group data by shift
const shifts = ['A', 'B', 'C'];
const seriesData = shifts.map(shift => ({
  name: `Shift ${shift}`,
  data: results.filter(r => r.shift === shift)
}));

// Render
<LineChart>
  {seriesData.map((series, i) => (
    <Line
      key={series.name}
      data={series.data}
      dataKey="qty_ton"
      stroke={COLORS[i]}
      name={series.name}
    />
  ))}
  <Legend />
</LineChart>
```

## Testing

### Test Case 1: Original Question
**Question**: "have shift A, B, C production data with different color"

**Expected**:
- ✅ Routes to SQL (not RAG)
- ✅ Generates query with `date, shift, qty_ton`
- ✅ Returns ~90 rows (30 dates × 3 shifts)
- ✅ Frontend shows 3 colored lines

### Test Case 2: Quick Question
**Question**: "Show shift A, B, C production data with different colors for January 2025"

**Expected**:
- ✅ Routes to SQL
- ✅ Includes date filter for January 2025
- ✅ Returns shift column
- ✅ Chart shows all 3 shifts

### Test Case 3: With Averages
**Question**: "show shift production with their average lines for January"

**Expected**:
- ✅ Routes to SQL
- ✅ Uses `PARTITION BY shift`
- ✅ Returns data + avg_by_shift column
- ✅ Chart shows 6 lines (3 data + 3 averages)

### Test Case 4: By Equipment
**Question**: "plot excavator production with different colors"

**Expected**:
- ✅ Routes to SQL
- ✅ Includes excavator column
- ✅ Returns data grouped by excavator
- ✅ Chart shows one line per excavator

## Benefits

### For Users
1. **See comparisons easily**: Multiple series on one chart
2. **Understand patterns**: Visual comparison of shifts/equipment
3. **Identify best performers**: See which shift produces most
4. **Spot trends**: Compare trends across different groups

### For Analysis
1. **Shift comparison**: Quickly see A vs B vs C performance
2. **Equipment comparison**: Compare excavator or dumper efficiency
3. **Pattern detection**: Identify which groups have consistent patterns
4. **Outlier detection**: Spot which group has unusual behavior

### For System
1. **Smarter routing**: Detects color-coding requests
2. **Better SQL**: Generates proper multi-series queries
3. **Flexible grouping**: Works with any grouping column
4. **Combined features**: Can add averages per group

## Debug Console Logs

When asking a multi-series question:

```
[Routing Decision] {
  task: 'sql',
  confidence: 0.92,
  reason: 'Multi-series visualization requiring color-coded groups',
  keywords: ['shift', 'different', 'color', 'production'],
  ...
}
```

SQL generated:
```
[SQL Query]
SELECT date, shift, qty_ton
FROM production_summary
WHERE EXTRACT(YEAR FROM date) = 2025
  AND EXTRACT(MONTH FROM date) = 1
ORDER BY date, shift
```

## Files Modified

1. **src/services/router.ts**:
   - Added multi-series chart detection to PRIORITY 1
   - Added comprehensive SQL generation guidance
   - Added 3 chart pattern examples
   - Updated fallback regex
   - Added multi-series examples

2. **src/types/index.ts**:
   - Added new Quick Question: "Plot shifts with different colors"
   - Now 9 questions total

## Common Issues & Solutions

### Issue 1: Only One Shift Showing
**Problem**: Query might have `WHERE shift = 'A'`
**Solution**: Don't filter by shift, include all shifts

### Issue 2: Aggregated Totals Instead of Detail
**Problem**: Query uses `GROUP BY shift`
**Solution**: Don't GROUP BY for charts, return detail rows

### Issue 3: Missing Shift Column
**Problem**: Query selects `date, qty_ton` without `shift`
**Solution**: Include grouping column in SELECT

### Issue 4: Frontend Not Coloring
**Problem**: Frontend doesn't detect multi-series
**Solution**: Frontend needs to check for grouping columns and split data

## Window Function Patterns

### Overall Average (All Shifts Combined)
```sql
AVG(qty_ton) OVER () as overall_avg
```
Returns same value for all rows.

### Per-Shift Average
```sql
AVG(qty_ton) OVER (PARTITION BY shift) as shift_avg
```
Returns different value per shift.

### Running Total Per Shift
```sql
SUM(qty_ton) OVER (PARTITION BY shift ORDER BY date) as running_total
```
Cumulative sum per shift over time.

## Summary

✅ Router now detects "different colors" and multi-series patterns
✅ SQL generator provides comprehensive guidance for 3 chart types
✅ Added examples for multi-series questions
✅ Enhanced fallback detection
✅ Added new Quick Question for multi-series demo
✅ Documented window function patterns
✅ Built and tested successfully

**Your question "have shift A, B, C production data with different color" will now route to SQL and generate proper multi-series chart data!**

## Next Steps

1. **Refresh browser** (`Ctrl+Shift+R`)
2. **Try the question**: "have shift A, B, C production data with different color"
3. **Check routing**: Should show `task: 'sql'` in console
4. **View results**: Should get ~90 rows with shift column
5. **Test Quick Question**: Click "Plot shifts with different colors"

**Note**: If frontend doesn't automatically color-code, you may need to update AnswerFormatter.tsx to detect the shift column and create multiple series.
