# Quick Questions - Final Update

## Summary
Added 2 new Quick Questions that combine multi-series visualization (by shift) with specific metrics (QTY TON and QTY M3) for January 2025 production data.

## New Quick Questions Added

### Question 7: Plot QTY TON by Shift for January
**Label**: "Plot QTY TON by shift for January"
**Full Question**: "Plot the QTY TON Production for each date of January 2025 separated by shift with different colors"
**Route**: SQL
**Purpose**: Show tonnage production over time, color-coded by shift

**Expected SQL**:
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

**Expected Output**:
- ~90 rows (30 dates × 3 shifts)
- Chart with 3 colored lines: Shift A, Shift B, Shift C
- Each line shows QTY TON over time
- Easy to compare which shift performs best

### Question 8: Plot QTY M3 by Shift for January
**Label**: "Plot QTY M3 by shift for January"
**Full Question**: "Plot the QTY M3 Production for each date of January 2025 separated by shift with different colors"
**Route**: SQL
**Purpose**: Show cubic meter production over time, color-coded by shift

**Expected SQL**:
```sql
SELECT
  date,
  shift,
  qty_m3
FROM production_summary
WHERE EXTRACT(YEAR FROM date) = 2025
  AND EXTRACT(MONTH FROM date) = 1
ORDER BY date, shift
```

**Expected Output**:
- ~90 rows (30 dates × 3 shifts)
- Chart with 3 colored lines: Shift A, Shift B, Shift C
- Each line shows QTY M3 over time
- Easy to compare shift performance for volume

## Complete Quick Questions List (11 Total)

### 1. Show Sample Data from January 2025
**Purpose**: Browse raw production records
**Type**: Data display

### 2. Plot QTY TON for January 2025
**Purpose**: Simple tonnage chart over time
**Type**: Single-series chart

### 3. Plot QTY M3 for January 2025
**Purpose**: Simple volume chart over time
**Type**: Single-series chart

### 4. Plot QTY TON with Average
**Purpose**: Tonnage with overall average line
**Type**: Chart with window function

### 5. Plot QTY M3 with Average
**Purpose**: Volume with overall average line
**Type**: Chart with window function

### 6. Plot Shifts with Different Colors
**Purpose**: Basic multi-series chart demo
**Type**: Multi-series chart

### 7. Plot QTY TON by Shift for January ⭐ NEW
**Purpose**: Tonnage comparison across shifts
**Type**: Multi-series chart (metric-specific)

### 8. Plot QTY M3 by Shift for January ⭐ NEW
**Purpose**: Volume comparison across shifts
**Type**: Multi-series chart (metric-specific)

### 9. SHIFT Wise Production Summary
**Purpose**: Aggregated totals per shift
**Type**: Tabular aggregation

### 10. Compare AVERAGE by SHIFT
**Purpose**: Statistical shift comparison
**Type**: Comparison analysis

### 11. Best Production Day in January
**Purpose**: Find peak production days
**Type**: Analysis query

## Organization

The 11 questions are organized by complexity and type:

**Level 1: Basic Data Access**
1. Show sample data

**Level 2: Simple Visualization**
2. Plot QTY TON
3. Plot QTY M3

**Level 3: Advanced Single-Series**
4. Plot QTY TON with Average
5. Plot QTY M3 with Average

**Level 4: Multi-Series Charts**
6. Plot shifts with different colors (generic)
7. Plot QTY TON by shift (specific) ⭐
8. Plot QTY M3 by shift (specific) ⭐

**Level 5: Aggregations & Analysis**
9. SHIFT wise summary
10. Compare AVERAGE by SHIFT
11. Best production day

## Why These 2 Questions?

### Combines Multiple Features
- ✅ Multi-series visualization (3 shifts)
- ✅ Specific metric focus (TON or M3)
- ✅ Time-based data (each date)
- ✅ Color-coded comparison
- ✅ January 2025 date filter

### Practical Use Cases

**Question 7 (QTY TON by shift)**:
- "Which shift produces the most tonnage?"
- "Is Shift A consistently better than B and C?"
- "Are there days when shifts perform similarly?"
- "What's the tonnage gap between best and worst shift?"

**Question 8 (QTY M3 by shift)**:
- "Which shift moves the most material volume?"
- "How do volume patterns differ from tonnage patterns?"
- "Does the same shift lead in both TON and M3?"
- "Are there volume efficiency differences?"

### Complements Existing Questions

**Builds on Question 6**: "Plot shifts with different colors"
- Question 6: Generic multi-series demo
- Questions 7 & 8: Metric-specific applications

**Different from Questions 4 & 5**: "Plot with Average"
- Questions 4 & 5: Overall average (all shifts combined)
- Questions 7 & 8: Separated by shift (compare shifts)

**More detailed than Question 9**: "SHIFT wise production summary"
- Question 9: Aggregated totals (loses time dimension)
- Questions 7 & 8: Time-series with shift separation (see trends)

## Expected Behavior

### When User Clicks Question 7

**Step 1**: Question sent to router
```
"Plot the QTY TON Production for each date of January 2025 separated by shift with different colors"
```

**Step 2**: Router detects
- Keywords: "Plot", "each date", "separated by shift", "different colors"
- Pattern: Multi-series chart
- Decision: `task: 'sql'`

**Step 3**: SQL generated
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

**Step 4**: Data returned
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
(~90 rows total)
```

**Step 5**: Frontend renders
- Detects `shift` column
- Groups data by shift value
- Creates 3 line series:
  - Line 1: Shift A (blue) - all dates with shift='A'
  - Line 2: Shift B (green) - all dates with shift='B'
  - Line 3: Shift C (orange) - all dates with shift='C'
- Adds legend showing shift colors
- X-axis: Dates, Y-axis: QTY TON

### When User Clicks Question 8

Same flow as Question 7, but:
- SQL selects `qty_m3` instead of `qty_ton`
- Y-axis shows QTY M3 instead of QTY TON
- Same 3 colored lines for shifts

## Comparison Chart

| Question | Metric | Grouping | Average Line | Use Case |
|----------|--------|----------|--------------|----------|
| Q2: Plot QTY TON | TON | None | No | Simple tonnage trend |
| Q3: Plot QTY M3 | M3 | None | No | Simple volume trend |
| Q4: Plot TON with Avg | TON | None | Yes (overall) | Tonnage vs average |
| Q5: Plot M3 with Avg | M3 | None | Yes (overall) | Volume vs average |
| Q6: Plot shifts colored | Both | By shift | No | Generic multi-series |
| **Q7: TON by shift** | **TON** | **By shift** | **No** | **Compare shift tonnage** |
| **Q8: M3 by shift** | **M3** | **By shift** | **No** | **Compare shift volume** |
| Q9: Shift summary | Both | By shift | No | Aggregated totals |
| Q10: Compare avg by shift | Both | By shift | No | Statistical comparison |

## SQL Patterns Comparison

### Simple Chart (Q2, Q3)
```sql
SELECT date, qty_ton FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
ORDER BY date
```
**Returns**: 30 rows (one per date)

### Chart with Average (Q4, Q5)
```sql
SELECT
  date,
  qty_ton,
  AVG(qty_ton) OVER () as avg_qty_ton
FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
ORDER BY date
```
**Returns**: 30 rows + average column

### Multi-Series Chart (Q7, Q8) ⭐
```sql
SELECT
  date,
  shift,
  qty_ton
FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
ORDER BY date, shift
```
**Returns**: 90 rows (30 dates × 3 shifts)

### Aggregation (Q9)
```sql
SELECT
  shift,
  SUM(qty_ton) as total_ton,
  AVG(qty_ton) as avg_ton
FROM production_summary
WHERE EXTRACT(MONTH FROM date) = 1
GROUP BY shift
ORDER BY shift
```
**Returns**: 3 rows (one per shift)

## Benefits

### For Users
1. **See shift patterns**: Visual comparison over time
2. **Identify best shift**: Clearly see which shift performs best
3. **Spot trends**: See if gaps between shifts are widening/closing
4. **Compare metrics**: Use Q7 for tonnage, Q8 for volume

### For Analysis
1. **Performance tracking**: Monitor shift efficiency
2. **Resource allocation**: Identify if certain shifts need help
3. **Optimization**: Find patterns in high-performing shifts
4. **Consistency**: See which shifts are most consistent

### For Demo/Training
1. **Multi-series capability**: Showcase color-coded charts
2. **Real comparisons**: Show actual shift differences
3. **Interactive learning**: Click and see results immediately
4. **Comprehensive coverage**: Both TON and M3 metrics

## Testing Checklist

After refreshing browser:

- [ ] **Question 7**: Click "Plot QTY TON by shift for January"
  - Should route to SQL
  - Should return ~90 rows with shift column
  - Should show chart with 3 colored lines
  - Y-axis labeled "QTY TON"
  - Legend shows Shift A, B, C

- [ ] **Question 8**: Click "Plot QTY M3 by shift for January"
  - Should route to SQL
  - Should return ~90 rows with shift column
  - Should show chart with 3 colored lines
  - Y-axis labeled "QTY M3"
  - Legend shows Shift A, B, C

- [ ] **Compare with Q6**: Click "Plot shifts with different colors"
  - Should be similar but might show both metrics
  - Q7 & Q8 are more specific (single metric)

- [ ] **Compare with Q4**: Click "Plot QTY TON with Average"
  - Q4 shows one line + average (all shifts combined)
  - Q7 shows 3 lines (shifts separated)
  - Different visualization approaches

## Files Modified

**src/types/index.ts**:
- Added 2 new questions after "Plot shifts with different colors"
- Total questions: 11 (was 9)
- Both questions route to SQL
- Both use multi-series pattern

## Summary

✅ Added 2 new Quick Questions
✅ Question 7: Plot QTY TON by shift for January
✅ Question 8: Plot QTY M3 by shift for January  
✅ Both combine multi-series + specific metrics
✅ Both demonstrate color-coded shift comparison
✅ Now have 11 total Quick Questions
✅ Built and tested successfully

**Refresh your browser to see the 2 new Quick Questions in the sidebar!**

They will appear as:
- "Plot QTY TON by shift for January"
- "Plot QTY M3 by shift for January"

Click either one to see production data separated by shift with different colors!
