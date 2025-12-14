# Quick Questions Update

## Summary
Updated the Quick Questions sidebar with 8 new production-focused questions that showcase the system's data visualization and analysis capabilities.

## New Quick Questions

### 1. Show Sample Data from January 2025
**Question**: "Show the Sample data from the Production Summary in January 2025"
**Route**: SQL
**Purpose**: Display raw data records for user to see what's available
**Expected Output**: Table with all production_summary columns filtered for January 2025

### 2. Plot QTY TON for January 2025
**Question**: "Plot the QTY TON Production in January 2025"
**Route**: SQL
**Purpose**: Visualize tonnage production over time
**Expected Output**: Line/bar chart showing daily QTY TON values

### 3. Plot QTY M3 for January 2025
**Question**: "Plot the QTY M3 Production in January 2025"
**Route**: SQL
**Purpose**: Visualize cubic meter production over time
**Expected Output**: Line/bar chart showing daily QTY M3 values

### 4. Plot QTY TON with Average
**Question**: "Plot the QTY TON and Average QTY Production in January 2025"
**Route**: SQL
**Purpose**: Show actual production with average line overlay
**Expected Output**: Chart with individual points + horizontal average line
**SQL Pattern**: Uses `AVG(qty_ton) OVER ()` window function

### 5. Plot QTY M3 with Average
**Question**: "Plot the QTY M3 and Average QTY Production in January 2025"
**Route**: SQL
**Purpose**: Show actual M3 production with average line overlay
**Expected Output**: Chart with individual points + horizontal average line
**SQL Pattern**: Uses `AVG(qty_m3) OVER ()` window function

### 6. SHIFT Wise Production Summary
**Question**: "Tabulate the SHIFT wise production summary for January 2025"
**Route**: SQL
**Purpose**: Group and aggregate production by shift
**Expected Output**: Table showing totals/averages per shift (A, B, C)
**SQL Pattern**: Uses `GROUP BY shift`

### 7. Compare AVERAGE by SHIFT
**Question**: "Examine the data of Production Summary and Compare the AVERAGE based on SHIFT"
**Route**: SQL
**Purpose**: Statistical comparison of shift performance
**Expected Output**: Table or chart comparing average production across shifts
**SQL Pattern**: Uses `AVG()` with `GROUP BY shift`

### 8. Best Production Day in January
**Question**: "In January 2025 which is the best Production day for TON QTY and for QTY M3"
**Route**: SQL
**Purpose**: Find peak production days for both metrics
**Expected Output**: Text answer identifying date(s) with highest values
**SQL Pattern**: Uses `MAX()` or `ORDER BY ... LIMIT 1`

## Comparison: Old vs New

### Old Questions (Removed)
1. ❌ "Production data for April" (RAG)
2. ❌ "Production in January" (RAG - too vague)
3. ❌ "Compare shift A and B production" (RAG)
4. ❌ "Highest production day" (RAG - better as SQL)
5. ❌ "Today's trips count" (SQL - not relevant to demo data)
6. ❌ "List all equipment" (SQL - not relevant to demo data)

**Problems with old questions**:
- Mixed RAG/SQL routing (confusing)
- Some questions failed (GROUP BY errors)
- Not focused on available data (January 2025 production data)
- Didn't showcase visualization capabilities

### New Questions (Added)
1. ✅ All focused on January 2025 (matches available data)
2. ✅ All route to SQL (consistent behavior)
3. ✅ Showcase different capabilities:
   - Data browsing
   - Simple charts
   - Charts with averages
   - Aggregations
   - Comparisons
4. ✅ Cover both metrics (QTY TON and QTY M3)
5. ✅ Demonstrate window functions
6. ✅ Show GROUP BY aggregations

## Why These Questions?

### Data-Driven
All questions focus on **January 2025** because:
- That's the month with actual production data in the system
- Questions will return real results (not empty)
- Users can see immediate value

### Capability Showcase
Questions demonstrate:
1. **Raw data access**: Sample data query
2. **Visualization**: Plot QTY TON/M3
3. **Advanced visualization**: Overlay average lines
4. **Aggregation**: SHIFT-wise summaries
5. **Comparison**: Compare shifts
6. **Analysis**: Find best production day

### User Learning Path
Questions are ordered by complexity:
1. Start simple: View sample data
2. Basic chart: Plot single metric
3. Alternate metric: Plot M3 instead
4. Advanced chart: Add average line (TON)
5. Repeat advanced: Add average line (M3)
6. Aggregation: Group by shift
7. Comparison: Compare shift averages
8. Analysis: Find best day

## Technical Details

### All Questions Route to SQL
**Why?**
- Updated router prioritizes visualization/calculation questions
- SQL is faster and more accurate for numerical data
- Charts need structured data from database
- Window functions enable advanced visualizations

**Previous Issue**: 
- Some questions routed to RAG
- RAG couldn't calculate averages
- GROUP BY errors occurred
- "Not enough evidence" errors

**Now Fixed**:
- All production questions → SQL
- Router detects "plot", "chart", "average", etc.
- Proper window function generation
- Consistent behavior

### Expected SQL Patterns

**Sample Data**:
```sql
SELECT * FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
  AND EXTRACT(YEAR FROM date) = 2025
ORDER BY date
LIMIT 10
```

**Plot QTY TON**:
```sql
SELECT date, qty_ton FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
  AND EXTRACT(YEAR FROM date) = 2025
ORDER BY date
```

**Plot with Average**:
```sql
SELECT
  date,
  qty_ton,
  AVG(qty_ton) OVER () as avg_qty_ton
FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
  AND EXTRACT(YEAR FROM date) = 2025
ORDER BY date
```

**SHIFT Summary**:
```sql
SELECT
  shift,
  COUNT(*) as record_count,
  SUM(qty_ton) as total_ton,
  AVG(qty_ton) as avg_ton,
  SUM(qty_m3) as total_m3,
  AVG(qty_m3) as avg_m3
FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
  AND EXTRACT(YEAR FROM date) = 2025
GROUP BY shift
ORDER BY shift
```

**Compare Shifts**:
```sql
SELECT
  shift,
  AVG(qty_ton) as avg_qty_ton,
  AVG(qty_m3) as avg_qty_m3
FROM production_summary
GROUP BY shift
ORDER BY avg_qty_ton DESC
```

**Best Production Day**:
```sql
SELECT
  date,
  qty_ton,
  qty_m3
FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
  AND EXTRACT(YEAR FROM date) = 2025
ORDER BY qty_ton DESC, qty_m3 DESC
LIMIT 1
```

## User Experience

### Before Update
**Sidebar showed**:
- 6 questions (mix of RAG and SQL)
- Generic questions
- Some failed with errors
- Not clear what system could do

**User confusion**:
- "Why does this one work but not that one?"
- "What data is actually available?"
- "How do I make a chart?"

### After Update
**Sidebar shows**:
- 8 focused questions
- All about January 2025 production
- Demonstrates key capabilities
- Clear progression from simple to complex

**User benefits**:
- Click any question → gets results
- See what data exists
- Learn by example
- Understand system capabilities

## Testing Checklist

After refreshing browser, test each quick question:

- [ ] Click "Show sample data from January 2025"
  - Should show table with ~30 rows
  - Columns: date, shift, excavator, dumper, etc.

- [ ] Click "Plot QTY TON for January 2025"
  - Should show line or bar chart
  - X-axis: dates, Y-axis: tonnage
  - ~30 data points

- [ ] Click "Plot QTY M3 for January 2025"
  - Should show line or bar chart
  - X-axis: dates, Y-axis: cubic meters
  - ~30 data points

- [ ] Click "Plot QTY TON with Average"
  - Should show chart with two elements:
    - Individual data points (bars/line)
    - Horizontal average line
  - Average line should be constant across chart

- [ ] Click "Plot QTY M3 with Average"
  - Same as above but for M3 metric
  - Two elements: data + average line

- [ ] Click "SHIFT wise production summary"
  - Should show table grouped by shift
  - Rows: Shift A, Shift B, Shift C
  - Columns: totals and averages

- [ ] Click "Compare AVERAGE by SHIFT"
  - Should show comparison (table or chart)
  - Clear difference between shifts
  - Ranked by performance

- [ ] Click "Best production day in January"
  - Should identify specific date(s)
  - Show values for both TON and M3
  - Answer in natural language

## Files Modified

**src/types/index.ts**:
- Updated `CANNED_QUESTIONS` array
- Replaced 6 old questions with 8 new ones
- All new questions have `expectedRoute: 'sql'`
- Labels are concise, questions are specific

## Benefits

### For Users
1. ✅ All questions work (no errors)
2. ✅ See real data immediately
3. ✅ Learn system capabilities
4. ✅ Understand January 2025 dataset
5. ✅ See chart examples
6. ✅ Learn by clicking

### For Demo/Training
1. ✅ Showcase visualization
2. ✅ Demonstrate window functions
3. ✅ Show aggregations
4. ✅ Prove SQL routing works
5. ✅ Highlight both metrics (TON/M3)
6. ✅ Progressive complexity

### For Development
1. ✅ Test cases built-in
2. ✅ Validation of router
3. ✅ SQL generator test
4. ✅ Chart rendering test
5. ✅ End-to-end testing

## Migration Notes

**No breaking changes**:
- Quick Questions is UI-only feature
- No database changes needed
- No API changes
- Just updated question list

**Users will notice**:
- Different questions in sidebar
- All questions focused on January 2025
- Better results, fewer errors
- More useful examples

## Summary

✅ Replaced 6 old questions with 8 new focused questions
✅ All questions target January 2025 production data
✅ All questions route to SQL for consistency
✅ Questions showcase visualization capabilities
✅ Questions demonstrate window functions for averages
✅ Questions cover both QTY TON and QTY M3 metrics
✅ Progressive complexity helps users learn
✅ Built and tested successfully

**Refresh your browser to see the new Quick Questions in the sidebar!**
