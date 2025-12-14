# Trip Summary Table - Complex Test Queries

## 30 Complex Queries for trip_summary_by_date Testing

### Equipment Performance Analysis (1-5)

1. **Multi-Equipment Comparison with Averages**
   - "Compare the average trips per day between tipper BB-44 and tipper BB-45 for April 2025"

2. **Equipment Efficiency Ranking**
   - "Show me the top 5 excavators by total trips in the first quarter of 2025, ranked from highest to lowest"

3. **Cross-Shift Equipment Performance**
   - "Which tipper had the most consistent trip count across all three shifts in March 2025?"

4. **Equipment Utilization Rate**
   - "What percentage of total trips did tipper BB-44 contribute in April 2025 compared to all tippers?"

5. **Multi-Metric Equipment Analysis**
   - "For excavator EX-001, show total trips and average trips per day for each month in Q1 2025"

### Time-Based Aggregations (6-10)

6. **Week-over-Week Comparison**
   - "Compare the total trip count in the first week versus the last week of April 2025"

7. **Quarterly Trend Analysis**
   - "Show me the monthly trend of trip counts for the first quarter of 2025, grouped by shift"

8. **Day-of-Week Performance**
   - "What day of the week had the highest total trip count in April 2025?"

9. **Multi-Period Moving Average**
   - "Calculate the 7-day moving average of total trips for April 2025"

10. **Peak Performance Days**
    - "Identify the top 10 days with the highest trip counts across all equipment in 2025"

### Shift Analysis (11-15)

11. **Shift Productivity Comparison**
    - "Compare the average trip count across shifts A, B, and C for the month of April 2025"

12. **Shift Equipment Allocation**
    - "Which excavator was used most frequently in Shift A during March 2025?"

13. **Cross-Shift Consistency**
    - "Show me the standard deviation of trip counts by shift for tipper BB-44 in April 2025"

14. **Shift Contribution Analysis**
    - "What percentage of total trips did Shift B contribute for each excavator in April 2025?"

15. **Best Performing Shift by Equipment**
    - "For each tipper, identify which shift had the highest average trips per day in Q1 2025"

### Route/Face Analysis (16-20)

16. **Route Efficiency Comparison**
    - "Compare the total trip count across different routes for April 2025"

17. **Multi-Route Performance**
    - "Which excavator completed the most trips across all routes combined in March 2025?"

18. **Route-Equipment Pairing**
    - "Show me the most common excavator-tipper pairs for each route in April 2025"

19. **Route Utilization Patterns**
    - "What percentage of trips went to each route/face in April 2025, broken down by shift?"

20. **Cross-Route Equipment Performance**
    - "For tipper BB-44, compare its trip count across different routes in April 2025"

### Complex Aggregations (21-25)

21. **Multi-Dimensional Grouping**
    - "Show total trips grouped by excavator, shift, and week for April 2025"

22. **Conditional Aggregations**
    - "Show all records where the trip count exceeded 10 in April 2025, grouped by equipment"

23. **Nested Percentile Analysis**
    - "Show me equipment that performed above the median trip count for their respective shifts in April 2025"

24. **Cumulative Totals**
    - "Calculate the cumulative trip count for tipper BB-44 throughout April 2025, day by day"

25. **Multi-Equipment Intersection**
    - "Find days when both tipper BB-44 and tipper BB-45 each completed more than 20 trips"

### Advanced Combinations (26-30)

26. **Equipment Pairing Optimization**
    - "Which excavator-tipper combination had the highest average trips per day in April 2025?"

27. **Performance Anomaly Detection**
    - "Show me days where tipper BB-44's trip count was more than 50% above its monthly average for April 2025"

28. **Multi-Shift Equipment Comparison**
    - "Compare the performance of all excavators across shifts, showing total trip count for March 2025"

29. **Route-Shift-Equipment Analysis**
    - "For route/face 'North Pit', show which excavator-shift combination completed the most trips in April 2025"

30. **Complex Time Window Analysis**
    - "Show the 5-day rolling sum of trips for tipper BB-44 in April 2025, identifying the best 5-day period"

## Expected Router Behavior

All these queries should:
- Route to **SQL task** (not RAG or OPTIMIZE)
- Select **trip_summary_by_date** table
- Have high confidence (>0.8)
- Extract appropriate parameters (dates, equipment IDs, shifts, metrics)

## Testing Checklist

- [ ] Intent classification correct
- [ ] Table selection = trip_summary_by_date
- [ ] Date filters properly parsed
- [ ] Equipment IDs normalized (e.g., "tipper BB-44" → "BB-44")
- [ ] Shift codes extracted (A, B, C)
- [ ] Aggregation types detected (SUM, AVG, COUNT, etc.)
- [ ] JOIN logic applied when needed
- [ ] GROUP BY clauses correct
- [ ] Complex conditions handled (percentiles, moving averages)
- [ ] SQL executes without errors
