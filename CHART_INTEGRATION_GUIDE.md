# Chart Integration Guide

## Overview

Charts are now automatically generated when users ask visualization questions. The system uses the **ChartAgent** component with client-side chart detection and rendering.

## How It Works

### 1. **User Asks Visualization Question**
Examples:
- "Show me a bar chart of production by shift"
- "Plot daily tonnage for last week"
- "Graph the comparison between shift A and B"

### 2. **Router Detects Visualization Intent**
The router checks for keywords: `chart`, `graph`, `plot`, `visualize`, `bar`, `line`, `pie`, etc.

Routes to **SQL** task (charts need structured data).

### 3. **SQL Query Executes**
Generates SQL like:
```sql
SELECT shift, SUM(qty_ton) as total_tonnage
FROM production_summary
WHERE date >= '2025-01-01'
GROUP BY shift
```

### 4. **Results Formatted with JSON Markers**
App.tsx wraps results:
```
<<<JSON_TABLE_DATA>>>[{"shift":"A","total_tonnage":15000}...]<<<JSON_TABLE_DATA>>>
```

### 5. **AnswerFormatter Detects Visualization Request**
- Parses question for chart keywords
- Extracts requested chart type (if specified)
- Renders **both** table and chart

### 6. **ChartAgent Generates Chart**
- Uses `syncChartClient` for instant client-side processing
- `chartDetector.ts` analyzes data structure
- Selects appropriate chart type (bar, line, pie, etc.)
- `ChartRenderer.tsx` renders with Recharts library

## Architecture Components

### Core Files

| File | Purpose |
|------|---------|
| `src/charts/ChartAgent.tsx` | Orchestrates chart preparation, handles async job polling |
| `src/charts/apiClient.ts` | Client-side sync API (no backend needed) |
| `src/charts/chartDetector.ts` | Detects best chart type from data structure |
| `src/charts/ChartRenderer.tsx` | Renders charts using Recharts |
| `src/charts/types.ts` | TypeScript definitions for chart configs |
| `src/components/AnswerFormatter.tsx` | Integrates ChartAgent into chat UI |

### Data Flow

```
User Question
    ↓
Router (detects "chart" keyword → SQL task)
    ↓
SQL Generator (creates aggregation query)
    ↓
Database Execution (returns rows)
    ↓
App.tsx (wraps in <<<JSON_TABLE_DATA>>> markers)
    ↓
AnswerFormatter (detects visualization request)
    ↓
ChartAgent (prepares chart config)
    ↓
ChartDetector (analyzes data, picks chart type)
    ↓
ChartRenderer (displays with Recharts)
```

## Sample Queries for Testing

### Production Analytics
1. **"Show me total production by shift"**
   - Expected: Bar chart with 3 bars (A, B, C)
   - Data: `SELECT shift, SUM(qty_ton) FROM production_summary GROUP BY shift`

2. **"Plot daily production for January 2025"**
   - Expected: Line chart over time
   - Data: `SELECT date, SUM(qty_ton) FROM production_summary WHERE EXTRACT(MONTH FROM date) = 1 GROUP BY date ORDER BY date`

3. **"Compare shift A vs B vs C for last week"**
   - Expected: Bar chart with 3 groups
   - Data: `SELECT shift, SUM(qty_ton) FROM production_summary WHERE date >= CURRENT_DATE - 7 GROUP BY shift`

### Equipment Performance
4. **"Graph trip counts by tipper"**
   - Expected: Bar chart showing top tippers
   - Data: `SELECT tipper_id, SUM(trip_count) FROM trip_summary_by_date GROUP BY tipper_id ORDER BY SUM(trip_count) DESC LIMIT 10`

5. **"Show excavator productivity as a line chart"**
   - Expected: Line chart with excavator performance over time
   - Data: `SELECT excavator, SUM(qty_ton) FROM trip_summary_by_date GROUP BY excavator`

### Trend Analysis
6. **"Visualize monthly tonnage trend for 2025"**
   - Expected: Line chart showing trend over months
   - Data: `SELECT EXTRACT(MONTH FROM date) as month, SUM(qty_ton) FROM production_summary WHERE EXTRACT(YEAR FROM date) = 2025 GROUP BY month ORDER BY month`

7. **"Show me a pie chart of trip distribution by route"**
   - Expected: Pie chart with route segments
   - Data: `SELECT route_or_face, SUM(trip_count) FROM trip_summary_by_date GROUP BY route_or_face`

### Specific Chart Types
8. **"Create a heatmap of production by date and shift"**
   - Expected: Heatmap with date vs shift
   - Data: `SELECT date, shift, SUM(qty_ton) FROM production_summary GROUP BY date, shift`

9. **"Draw a scatter plot of trip count vs tonnage"**
   - Expected: Scatter plot
   - Data: `SELECT trip_count, qty_ton FROM trip_summary_by_date`

10. **"Pareto chart of tippers by total tonnage"**
    - Expected: Pareto chart (bar + cumulative line)
    - Data: `SELECT tipper_id, SUM(qty_ton) FROM trip_summary_by_date GROUP BY tipper_id ORDER BY SUM(qty_ton) DESC`

## Chart Type Detection Logic

The system automatically selects the best chart type:

| Data Characteristics | Chart Type | Example Query |
|---------------------|------------|---------------|
| 1 categorical + 1 numeric | **Bar** | Production by shift |
| Date/time + numeric | **Line** | Daily tonnage trend |
| 2 numeric columns | **Scatter** | Trips vs tonnage |
| 1 categorical + 1 numeric (parts of whole) | **Pie** | Route distribution |
| 2 categorical + 1 numeric | **Heatmap** | Date × Shift production |
| 1 categorical + 3+ numeric | **Radar** | Multi-metric comparison |
| Ranked categories | **Pareto** | Top equipment by performance |

### User Can Override

If user explicitly requests a type: "Show me a **pie chart** of...", the system honors it (if data supports it).

## Configuration

### ChartAgent Props (in AnswerFormatter)

```tsx
<ChartAgent
  sourceRef={{ sql_result: { query_id: 'inline-data' } }}
  userId="00000000-0000-0000-0000-000000000001"
  sourceType="sql_result"
  data_sample={jsonData}  // Inline data for client-side processing
  hints={{
    query: question,  // Original user question
    prefer_chart_types: ['bar', 'line'],  // Default preferences
    max_rows_sample: 1000
  }}
  apiClient={syncChartClient}  // Client-side processor (no backend)
  debug={false}  // Set to true to see job IDs
/>
```

### Visualization Detection (in AnswerFormatter)

```tsx
const requestsVisualization = useMemo(() => {
  if (!question) return false;
  const q = question.toLowerCase();
  return /\b(chart|graph|plot|visualize|visualization|bar|line|pie|scatter|show.*chart|draw|heatmap|radar|pareto)\b/i.test(q);
}, [question]);
```

## Customization

### Adding New Chart Types

1. **Update types.ts**: Add new chart type to `ChartType` union
2. **Update chartDetector.ts**: Add detection logic in `detectChartType()`
3. **Update ChartRenderer.tsx**: Add rendering component for new type

### Modifying Detection Rules

Edit `src/charts/chartDetector.ts`:

```typescript
// Example: Make "trend" keyword trigger line charts
if (/trend|timeline|over time/i.test(requestedType)) {
  return 'line';
}
```

### Changing Default Chart Preferences

In `AnswerFormatter.tsx`, modify the `hints` prop:

```tsx
hints={{
  query: question,
  prefer_chart_types: ['line', 'area', 'bar'],  // Prefer line charts first
  max_rows_sample: 500  // Reduce sample size for faster rendering
}}
```

## Performance Notes

- **Client-side processing**: No backend API calls, instant chart generation
- **Data sampling**: Limited to 1000 rows by default (configurable via `max_rows_sample`)
- **Memoization**: Uses `useMemo` to prevent unnecessary re-renders
- **Synchronous mode**: `syncChartClient` processes charts immediately, no polling

## Troubleshooting

### Chart Not Appearing

1. **Check question has visualization keyword**: "chart", "graph", "plot", etc.
2. **Verify SQL returned data**: Look for `<<<JSON_TABLE_DATA>>>` markers in console
3. **Check browser console**: Look for chart rendering errors
4. **Enable debug mode**: Set `debug={true}` in ChartAgent to see job IDs

### Wrong Chart Type

1. **Specify chart type explicitly**: "Show me a **bar chart** of..."
2. **Check data structure**: Some chart types need specific column combinations
3. **Review chartDetector logic**: May need adjustment for your data patterns

### Data Not Detected

1. **Ensure JSON markers present**: `<<<JSON_TABLE_DATA>>>${JSON.stringify(data)}<<<JSON_TABLE_DATA>>>`
2. **Check JSON parsing**: Look for parse errors in console
3. **Verify data format**: Must be array of objects `[{col1: val1, col2: val2}, ...]`

## Future Enhancements

- [ ] LLM-based chart type selection fallback
- [ ] Chart export (PNG, SVG, PDF)
- [ ] Interactive chart filtering/drilling
- [ ] Chart styling customization UI
- [ ] Multi-chart dashboards
- [ ] Chart annotations and highlights
- [ ] Backend API for large datasets (async processing)

## Testing Checklist

- [ ] Ask "show production by shift" → Bar chart appears
- [ ] Ask "plot daily tonnage" → Line chart appears
- [ ] Ask "pie chart of routes" → Pie chart appears
- [ ] Ask "compare shifts" without "chart" keyword → Table only (no chart)
- [ ] Ask "show data" → Table only (no chart keyword)
- [ ] Try all 10 sample queries above
- [ ] Verify charts render correctly in dark mode
- [ ] Check charts are responsive on mobile
