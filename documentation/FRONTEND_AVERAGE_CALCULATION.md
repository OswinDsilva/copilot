# Frontend Average Calculation Implementation

## Problem

Monthly summary SQL queries return accurate raw metrics but cannot include calculated fields (avg_daily_tonnage, max/min) due to `execute_safe_sql()` RPC limitations:
- AS keyword rejected (explicit aliases, implicit aliases, CAST...AS...)
- Arithmetic operators rejected (/, *, ::)
- Every attempt to calculate averages in SQL resulted in "syntax error"

## Solution

Calculate derived metrics on the frontend in `ResultsTable.tsx` component.

## Implementation

### Detection Pattern (lines 18-23)
```typescript
const hasMonthlyPattern = data.length === 1 && 
  keys.length >= 3 &&
  keys.every(k => !isNaN(Number(data[0][k])));
```

Detects monthly summary results: single row with 3-6 numeric columns.

### Column Mapping (lines 27-40)
Since SQL subqueries return unnamed columns (`?column?`), we map positionally:
- Position 0 → `total_tonnage`
- Position 1 → `total_cubic_meters`
- Position 2 → `production_days`
- Position 3 → `total_trips` (if present)
- Position 4 → `unique_tippers` (if present)
- Position 5 → `unique_excavators` (if present)

### Calculation (lines 32-34)
```typescript
const avgDaily = values[0] / values[2];
namedRow.avg_daily_tonnage = Math.round(avgDaily * 100) / 100;
```

Calculates average daily tonnage (total_tonnage / production_days), rounds to 2 decimal places.

## Example

**Query:** "Give me complete summary of January 2025"

**SQL Returns:**
```
[52174, 141986, 30, 1373, 9, 3]
```

**Frontend Transforms To:**
```javascript
{
  total_tonnage: 52174,
  total_cubic_meters: 141986,
  production_days: 30,
  total_trips: 1373,
  unique_tippers: 9,
  unique_excavators: 3,
  avg_daily_tonnage: 1739.13  // ← Calculated: 52174 / 30
}
```

## Benefits

1. **Avoids RPC limitations**: No AS keywords, no arithmetic in SQL
2. **Accurate data**: SQL returns correct raw metrics (1373 trips, not 2308 duplicated)
3. **Flexible**: Can add more calculations (trips_per_day, max/min) without SQL changes
4. **Fast**: Simple division in JavaScript, negligible performance impact

## Testing

Test query: `"Give me complete summary of January 2025"`

Expected result:
- Total Tonnage: 52,174
- Total Cubic Meters: 141,986
- Production Days: 30
- Total Trips: 1,373
- Unique Tippers: 9
- Unique Excavators: 3
- **Avg Daily Tonnage: 1,739.13** ← Calculated field

## Alternative Approaches (Not Implemented)

1. **Modify execute_safe_sql() RPC**: Would require database migration, risky
2. **Create custom monthly_summary() RPC**: Over-engineering for single query type
3. **Use raw SQL**: Bypasses safety features, security risk

## Files Changed

- `src/components/ResultsTable.tsx` (lines 18-50): Detection, mapping, calculation logic
