# Chart Rendering Fix for Statistical Aggregations

## Problem
Query: "chart and visualize mean, median, mode, and standard deviation for QTY TON and QTY CUM production in January 2025"

**Issue**: Chart buttons (table/chart toggle) were not appearing for statistical aggregation queries.

## Root Cause
The chart detection logic in `AnswerFormatter.tsx` had this condition:
```typescript
const isChartable = keys.length >= 2 && data.length > 1;
```

This required **multiple rows** of data (`data.length > 1`) to enable charting.

**Problem**: Statistical aggregations like mean, median, mode, std_dev return a **single row** with multiple columns:
```json
[{
  "mean_qty_ton": 1250.5,
  "median_qty_ton": 1200.0,
  "mode_qty_ton": 1180.0,
  "stddev_qty_ton": 150.3,
  "mean_qty_m3": 950.2,
  "median_qty_m3": 920.0,
  ...
}]
```

Since `data.length === 1`, the chart buttons never appeared.

## Solution
Updated chart detection and rendering logic in `src/components/AnswerFormatter.tsx`:

### 1. Enhanced Chart Detection
```typescript
// Chart is possible if:
// 1. Multiple rows with at least 2 columns (time series, comparisons, etc.)
// 2. OR single row with multiple numeric columns (aggregated stats: mean, median, etc.)
const isChartable = (keys.length >= 2 && data.length > 1) || 
                    (data.length === 1 && numericKeys.length >= 2);
```

### 2. Data Transformation for Single-Row Aggregations
When rendering charts for single-row statistical data, transform the wide format into a tall format:

**Input (single row, multiple columns)**:
```json
[{ "mean": 100, "median": 95, "mode": 90, "stddev": 15 }]
```

**Transformed for charting**:
```json
[
  { "statistic": "mean", "value": 100 },
  { "statistic": "median", "value": 95 },
  { "statistic": "mode", "value": 90 },
  { "statistic": "stddev", "value": 15 }
]
```

### 3. Conditional Chart Rendering
```typescript
// Transform single-row aggregation data for charts
let chartData = data;
if (data.length === 1 && numericKeys.length >= 2) {
  chartData = numericKeys.map(key => ({
    statistic: key.replace(/_/g, ' '),
    value: data[0][key]
  }));
}

// Use transformed data in charts
{data.length === 1 && numericKeys.length >= 2 ? (
  <Bar dataKey="value" fill={COLORS[0]} />
) : (
  numericKeys.map((key, idx) => (
    <Bar key={key} dataKey={key} fill={COLORS[idx % COLORS.length]} />
  ))
)}
```

## Impact
✅ **Queries Now Chartable**:
- "calculate mean, median, mode for QTY TON"
- "show average, min, max, stddev for production"
- "aggregate statistics for January 2025 production"
- "summarize QTY TON and QTY CUM with mean, median, mode"

✅ **Chart Types Supported**:
- Bar Chart: Compare statistics side-by-side
- Line Chart: Visualize statistical trends
- Pie Chart: Show proportion of statistics

✅ **Backward Compatible**:
- Multi-row queries still work as before (time series, shift comparisons, etc.)
- Table view always available
- Original data structure preserved in table view

## Example Queries

### Statistical Aggregations (Now Chartable ✅)
```sql
-- Mean, median, mode, stddev
"chart and visualize mean, median, mode, and standard deviation for QTY TON and QTY CUM production in January 2025"

-- Min, max, average
"show min, max, average for production in January"

-- Multiple aggregations
"calculate sum, avg, count, stddev for shift A in January"
```

### Time Series (Already Chartable ✅)
```sql
-- Daily production
"show daily production for January 2025"

-- Shift comparison over time
"compare shift A, B, C production over January"
```

## Technical Details
**File Modified**: `src/components/AnswerFormatter.tsx`

**Changes**:
1. Line ~160: Enhanced `isChartable` condition
2. Lines ~165-173: Data transformation logic for single-row aggregations
3. Lines ~174-175: Dynamic labelKey and valueKey selection
4. Lines ~250-285: Conditional chart rendering based on data structure

**No Breaking Changes**: All existing chart functionality preserved.
