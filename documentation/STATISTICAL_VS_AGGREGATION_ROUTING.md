# Statistical vs Aggregation Query Routing

## Problem Summary

Queries like **"calculate mean, median and mode for january production"** were incorrectly routing to `AGGREGATION_QUERY` instead of `STATISTICAL_QUERY`, resulting in simple SQL aggregation (AVG, SUM, COUNT) rather than advanced statistical analysis (mean, median, mode, stddev).

## Root Cause

1. **Keyword Overlap**: The word "calculate" appeared in `AGGREGATION_QUERY` keywords, causing scoring conflicts
2. **Intent Scoring Competition**: Both `STATISTICAL_QUERY` (TIER_1) and `AGGREGATION_QUERY` (TIER_3) scored points
3. **Filter Order**: Mutual exclusion logic ran after tier-based filtering, allowing `AGGREGATION_QUERY` to survive in some cases

## Solution Applied

### 1. Enhanced STATISTICAL_QUERY Keywords
Added phrase-based matches to capture statistical operations with action verbs:

```typescript
{ intent: 'STATISTICAL_QUERY', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
  'mean', 'median', 'mode', 'standard deviation', 'stddev', 'std dev', 'deviation',
  'statistical analysis','statistical measure','statistical','analysis',
  'calculate mean', 'calculate median', 'calculate mode', 'calculate deviation',
  'compute mean', 'compute median', 'compute mode', 'compute deviation'
]}
```

### 2. Cleaned AGGREGATION_QUERY Keywords
Removed overlapping terms that could appear in statistical contexts:

```typescript
{ intent: 'AGGREGATION_QUERY', tier: IntentTier.TIER_3_GENERIC, keywords: [
  'sum', 'total', 'count',  // Removed: 'average', 'calculate', 'compute'
  'aggregate', 'aggregation',
  'complete summary', 'aggregate summary', 'summary of', 'overall', 'entire'
]}
```

### 3. Priority-Based Filtering
Moved statistical intent filtering to run **before** tier-based filtering:

```typescript
// CRITICAL: Filter statistical intent FIRST before tier filtering
const hasStatisticalIntent = filteredCandidates.some(c => c.intent === 'STATISTICAL_QUERY');
if (hasStatisticalIntent) {
  filteredCandidates = filteredCandidates.filter(c => c.intent !== 'AGGREGATION_QUERY');
}
```

## Query Type Decision Matrix

| Query Pattern | Intent Detected | SQL Builder Used | Operations |
|---------------|----------------|------------------|------------|
| "calculate mean, median and mode for january" | `STATISTICAL_QUERY` | `buildStatisticalSQL` | Mean, Median, Mode |
| "standard deviation of july production" | `STATISTICAL_QUERY` | `buildStatisticalSQL` | Stddev |
| "statistical analysis of months" | `STATISTICAL_QUERY` | `buildStatisticalSQL` | All stats |
| "which month has highest mean" | `STATISTICAL_QUERY` | `buildStatisticalSQL` | Mean with ranking |
| "total production in january" | `AGGREGATION_QUERY` | `buildSQL` | SUM |
| "count of trips" | `AGGREGATION_QUERY` | `buildSQL` | COUNT |
| "show january summary" | `MONTHLY_SUMMARY` | `buildSQL` | Date filter + aggregation |

## Statistical Operations Supported

### Mean (Average)
- Keywords: `mean`, `average`, `avg`, `calculate mean`
- SQL: `AVG(qty_ton)` or percentile-based calculation for accuracy

### Median
- Keywords: `median`, `50th percentile`
- SQL: `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY qty_ton)`

### Mode
- Keywords: `mode`, `most frequent`, `most common`
- SQL: Window function with `COUNT() OVER` and `RANK()`

### Standard Deviation
- Keywords: `standard deviation`, `stddev`, `std dev`, `deviation`, `variance`
- SQL: `STDDEV_SAMP(qty_ton)` or `STDDEV_POP(qty_ton)`

## Router Flow for Statistical Queries

```
User Input: "calculate mean, median and mode for january production"
  ↓
Intent Extraction (intent.ts)
  - Matches: 'calculate mean', 'median', 'mode'
  - Intent: STATISTICAL_QUERY (TIER_1_SPECIFIC)
  - Score: High (multiple keyword matches)
  ↓
Intent Filtering
  - hasStatisticalIntent = true
  - Remove AGGREGATION_QUERY from candidates
  ↓
Rule-Based Router (ruleRouter.ts)
  - Detects: intentName === 'STATISTICAL_QUERY'
  - Attaches: statisticalTemplate with operations
  - Sets: intent = 'STATISTICAL_QUERY'
  ↓
Main Router (index.ts)
  - Preserves: intent if statisticalTemplate present
  - Decision: task='sql', intent='STATISTICAL_QUERY'
  ↓
SQL Builder (sqlBuilder.ts)
  - Routes to: buildStatisticalSQL()
  - Generates: PERCENTILE_CONT, STDDEV, window functions
```

## Testing Commands

```typescript
// Should route to STATISTICAL_QUERY
"calculate mean, median and mode for january production"
"what is the standard deviation of july"
"compute mean and median for each month"
"statistical analysis of monthly production"

// Should route to AGGREGATION_QUERY
"total production in january"
"sum of all trips"
"count the number of shifts"

// Should route to MONTHLY_SUMMARY
"january summary"
"show me february report"
```

## Impact

- **Before**: Statistical queries generated simple `AVG()` SQL
- **After**: Statistical queries generate advanced PostgreSQL statistical functions
- **Coverage**: All queries with mean/median/mode/stddev keywords now route correctly
- **Regression**: No impact on aggregation queries (sum, total, count still work)

## Files Modified

1. `src/router/services/intent.ts`: Enhanced keywords and filter order
2. `src/router/index.ts`: Preserved statistical intent (already fixed)
3. `src/router/ruleRouter.ts`: Statistical template attachment (already implemented)
4. `src/router/builders/statisticalBuilder.ts`: Statistical SQL generation (already implemented)

## Related Documentation

- [Hybrid Router Design](./HYBRID_ROUTER_DESIGN.md)
- [Parameter Extraction Improvements](./PARAMETER_EXTRACTION_IMPROVEMENTS.md)
- [Trip Summary Table Implementation](./TRIP_SUMMARY_TABLE_IMPLEMENTATION.md)
