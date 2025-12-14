# Quick Test Queries for Mining Co-Pilot

## Visualization Queries (Will Generate Charts + Tables)

### Basic Analytics
1. Show me total production by shift
2. Plot daily production for January 2025
3. Graph production comparison between shift A, B, and C
4. Show me a bar chart of tonnage by month
5. Draw a line chart of daily trips for last week

### Equipment Performance
6. Graph trip counts by tipper
7. Show excavator productivity as a line chart
8. Plot BB-53 trips over time
9. Visualize top 10 tippers by tonnage
10. Compare EX-01 vs EX-02 performance with a bar chart

### Trends & Patterns
11. Visualize monthly tonnage trend for 2025
12. Plot shift performance over the last month
13. Show me production trends for February
14. Graph average trips per shift by week
15. Chart the daily target vs actual production

### Specific Chart Types
16. Show me a pie chart of trip distribution by route
17. Create a heatmap of production by date and shift
18. Draw a scatter plot of trip count vs tonnage
19. Pareto chart of tippers by total tonnage
20. Area chart showing cumulative production

## Data Queries (Tables Only, No Charts)

### Production Data
21. What was the total production in tons for January 2025?
22. Show me production data for last week
23. List all production records for shift A
24. Find total tonnage by month for 2025
25. How many trips were completed yesterday?

### Equipment Queries
26. Which tipper had the highest number of trips in March?
27. List all tippers that worked on 10-01-2025
28. Show me all excavators and their operating hours
29. Find equipment with more than 100 trips last month
30. What is BB-44's total tonnage this year?

### Comparisons
31. Compare shift A, B, and C for yesterday's production
32. Which excavator performed best in terms of tonnage this quarter?
33. Show production by shift for the last 7 days
34. Compare January vs February production
35. What is shift A vs shift B average tonnage?

### Aggregations & Calculations
36. What is the average tonnage per shift for February?
37. Calculate total trips by route for last month
38. Show target vs actual achievement by shift
39. Find average trip count per tipper in January
40. Sum up total production for Q1 2025

## Optimization Queries

### Equipment Replacement
41. Tipper BB-53 went down, which tipper should replace it?
42. If BB-44 is unavailable, which tipper should I use?
43. Find the best alternative to excavator EX-01
44. Which equipment can replace BB-25 for shift B?
45. Show me backup options for BB-17

### Equipment Selection
46. Find the best combination of tipper and excavator
47. What is the most efficient tipper-excavator pairing?
48. Recommend optimal equipment for 5000 ton target
49. Which tippers work best with EX-02?
50. Show top 5 equipment combinations by efficiency

### Forecasting
51. Forecast production for the next 5 days
52. Predict tonnage for next week
53. What is the expected production for February?
54. Estimate trips needed to reach 10000 tons
55. Project shift A performance for next 7 days

## Follow-up & Context Queries

### Simple Follow-ups
56. "Show production by shift" → "What about last month?"
57. "Total tonnage in January" → "And February?"
58. "BB-53 trips" → "Show for shift B only"
59. "Excavator performance" → "Just for last week"
60. "Top tippers" → "Exclude BB-44"

### Refinement Queries
61. "Show all production" → "Filter by shift A"
62. "Trip counts" → "Only for routes 1 and 2"
63. "January data" → "Break down by day"
64. "Equipment list" → "With more than 50 trips"
65. "Shift comparison" → "Add tonnage column"

## Edge Cases & Validation

### Equipment ID Validation (Should Work Correctly)
66. Show BB-53 trips (tipper - should use tipper_id column)
67. Show EX-189 performance (excavator - should use excavator column)
68. List all BB- equipment (should query tippers only)
69. Find EX- equipment with highest tonnage (excavators only)
70. Compare BB-01 with BB-02 (both tippers)

### Date Range Queries
71. Production from 01-01-2025 to 01-15-2025
72. Show data between January 1st and February 1st
73. Last 30 days production summary
74. This month's trip count
75. Year to date tonnage

### Shift-Specific (Should Include All Shifts A, B, C)
76. Show production for all shifts
77. Break down by shift for January
78. Which shift produced the most?
79. List shifts with production over 1000 tons
80. Average production per shift

## Testing Checklist

### Chart Generation
- [ ] Queries 1-20 should generate charts
- [ ] Chart type matches request (bar, line, pie, etc.)
- [ ] Charts render correctly in light/dark mode
- [ ] Both table and chart appear together

### SQL Generation
- [ ] Queries 21-40 generate correct SQL
- [ ] Equipment IDs route to correct columns (BB-→tipper_id, EX-→excavator)
- [ ] Date filters work correctly
- [ ] Shift filters include A, B, and C
- [ ] No contradictory logic (e.g., `col = 'X' AND col <> 'X'`)

### Optimization
- [ ] Replacement queries exclude the broken equipment
- [ ] Forecasts show trend and predictions
- [ ] Equipment selection shows top combinations
- [ ] Results are based on actual data

### Follow-ups
- [ ] Context maintained from previous question
- [ ] Parameters carried forward correctly
- [ ] Refinements apply to previous query
- [ ] No duplicate context issues

### Edge Cases
- [ ] BB- IDs only match tipper_id column
- [ ] EX- IDs only match excavator column
- [ ] Mixed BB/EX queries don't cause errors
- [ ] Invalid equipment IDs show proper error messages
- [ ] Date parsing handles multiple formats
