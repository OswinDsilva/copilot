/**
 * Comprehensive Natural Language Query Test Suite
 * 
 * Tests routing and intent detection for mining operations queries
 * Covers all columns from production_summary and trip_summary_by_date tables
 * 
 * TABLE SCHEMAS:
 * 
 * production_summary:
 * - id, user_id, date, shift, excavator, dumper, trip_count_for_mining,
 *   qty_ton, trip_count_for_reclaim, qty_m3, total_trips, grader, dozer, created_at
 * 
 * trip_summary_by_date:
 * - id, user_id, trip_date, shift, tipper_id, excavator, route_or_face,
 *   trip_count, remarks, created_at
 */

const comprehensiveTestQueries = [
  
  // =================================================================
  // PRODUCTION_SUMMARY TABLE QUERIES
  // =================================================================
  
  // --- Date-based queries ---
  {
    query: "Show me production data for January 2025",
    expectedTable: "production_summary",
    expectedIntent: "MONTHLY_SUMMARY",
    columns: ["date"]
  },
  {
    query: "What was the production on April 15th?",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["date"]
  },
  {
    query: "Give me last week's production summary",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["date"]
  },
  {
    query: "Show production between March 1st and March 31st",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["date"]
  },
  {
    query: "What's today's production?",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["date"]
  },
  
  // --- Shift-based queries ---
  {
    query: "Show me shift A production",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["shift"]
  },
  {
    query: "Which shift performed best today?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["shift", "qty_ton"]
  },
  {
    query: "Compare shift A vs shift B production",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["shift", "qty_ton"]
  },
  {
    query: "What's the total production for shift C this month?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["shift", "qty_ton", "date"]
  },
  {
    query: "Show me all shifts for yesterday",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["shift", "date"]
  },
  
  // --- Equipment count queries (excavator, dumper, grader, dozer) ---
  {
    query: "How many excavators were working today?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["excavator", "date"]
  },
  {
    query: "Show me dumper utilization for this week",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["dumper", "date"]
  },
  {
    query: "What's the average number of graders used per shift?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["grader", "shift"]
  },
  {
    query: "How many dozers were deployed in March?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["dozer", "date"]
  },
  {
    query: "Show equipment allocation for shift A",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["excavator", "dumper", "grader", "dozer", "shift"]
  },
  
  // --- Tonnage queries (qty_ton) ---
  {
    query: "What's the total tonnage for January?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["qty_ton", "date"]
  },
  {
    query: "Show me daily tonnage production",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["qty_ton", "date"]
  },
  {
    query: "What was the highest tonnage day this month?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["qty_ton", "date"]
  },
  {
    query: "Calculate average tonnage per shift",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["qty_ton", "shift"]
  },
  {
    query: "How much tonnage did we produce yesterday?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["qty_ton", "date"]
  },
  
  // --- Volume queries (qty_m3) ---
  {
    query: "What's the total volume in cubic meters for this week?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["qty_m3", "date"]
  },
  {
    query: "Show me m3 production by shift",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["qty_m3", "shift"]
  },
  {
    query: "What's the average cubic meter production per day?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["qty_m3", "date"]
  },
  
  // --- Trip count queries (total_trips, trip_count_for_mining, trip_count_for_reclaim) ---
  {
    query: "How many total trips were made today?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["total_trips", "date"]
  },
  {
    query: "Show mining trips for this month",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["trip_count_for_mining", "date"]
  },
  {
    query: "What are the reclaim trip counts for shift B?",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["trip_count_for_reclaim", "shift"]
  },
  {
    query: "Compare mining trips vs reclaim trips",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["trip_count_for_mining", "trip_count_for_reclaim"]
  },
  {
    query: "What's the trip count breakdown for yesterday?",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["total_trips", "trip_count_for_mining", "trip_count_for_reclaim", "date"]
  },
  
  // --- Multi-column aggregation queries ---
  {
    query: "Show me total tonnage and trips for each shift",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["qty_ton", "total_trips", "shift"]
  },
  {
    query: "What's the production summary for this week?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["date", "qty_ton", "qty_m3", "total_trips"]
  },
  {
    query: "Show equipment utilization and production for March",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["excavator", "dumper", "grader", "dozer", "qty_ton", "date"]
  },
  
  // =================================================================
  // TRIP_SUMMARY_BY_DATE TABLE QUERIES
  // =================================================================
  
  // --- Tipper/Vehicle queries (tipper_id) ---
  {
    query: "Show me trips for tipper BB-44",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "EQUIPMENT_SPECIFIC_PRODUCTION",
    columns: ["tipper_id", "trip_count"]
  },
  {
    query: "Which tipper made the most trips today?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["tipper_id", "trip_count", "trip_date"]
  },
  {
    query: "List all tippers that worked yesterday",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["tipper_id", "trip_date"]
  },
  {
    query: "What trucks were deployed in shift A?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["tipper_id", "shift"]
  },
  {
    query: "Show me BB-40 performance this week",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "EQUIPMENT_SPECIFIC_PRODUCTION",
    columns: ["tipper_id", "trip_count", "trip_date"]
  },
  {
    query: "How many trips did each dumper make?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["tipper_id", "trip_count"]
  },
  
  // --- Excavator queries (excavator) ---
  {
    query: "Show me trips for excavator EX-189",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "EQUIPMENT_SPECIFIC_PRODUCTION",
    columns: ["excavator", "trip_count"]
  },
  {
    query: "Which excavator had the highest productivity?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["excavator", "trip_count"]
  },
  {
    query: "List all excavators working today",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["excavator", "trip_date"]
  },
  {
    query: "What's EX-190 performance for this month?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "EQUIPMENT_SPECIFIC_PRODUCTION",
    columns: ["excavator", "trip_count", "trip_date"]
  },
  
  // --- Equipment combination queries (tipper_id + excavator) ---
  {
    query: "Which tippers worked with excavator EX-189?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "EQUIPMENT_COMBINATION",
    columns: ["tipper_id", "excavator"]
  },
  {
    query: "Show me tipper and excavator pairings",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "EQUIPMENT_COMBINATION",
    columns: ["tipper_id", "excavator", "trip_count"]
  },
  {
    query: "What combinations worked best today?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "EQUIPMENT_COMBINATION",
    columns: ["tipper_id", "excavator", "trip_count", "trip_date"]
  },
  {
    query: "Which excavator did BB-44 work with?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "EQUIPMENT_COMBINATION",
    columns: ["tipper_id", "excavator"]
  },
  
  // --- Route/Location queries (route_or_face) ---
  {
    query: "Show me trips from Mining Bench 1",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "ROUTES_FACES_ANALYSIS",
    columns: ["route_or_face", "trip_count"]
  },
  {
    query: "Which route had the most activity?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "ROUTES_FACES_ANALYSIS",
    columns: ["route_or_face", "trip_count"]
  },
  {
    query: "What faces were active in shift B?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "ROUTES_FACES_ANALYSIS",
    columns: ["route_or_face", "shift"]
  },
  {
    query: "Show haul routes used yesterday",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "ROUTES_FACES_ANALYSIS",
    columns: ["route_or_face", "trip_date"]
  },
  
  // --- Trip date queries (trip_date) ---
  {
    query: "Show trip data for last week",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["trip_date", "trip_count"]
  },
  {
    query: "What's the trip count for March 15th?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["trip_date", "trip_count"]
  },
  {
    query: "Show me daily trip trends for this month",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["trip_date", "trip_count"]
  },
  
  // --- Shift-based trip queries ---
  {
    query: "How many trips in shift A today?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["shift", "trip_count", "trip_date"]
  },
  {
    query: "Compare trip counts across all shifts",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["shift", "trip_count"]
  },
  {
    query: "Which shift had the most trips yesterday?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["shift", "trip_count", "trip_date"]
  },
  
  // --- Trip count aggregations ---
  {
    query: "What's the total trip count for this week?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["trip_count", "trip_date"]
  },
  {
    query: "Show average trips per tipper",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["tipper_id", "trip_count"]
  },
  {
    query: "What's the maximum trips made by any vehicle?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["tipper_id", "trip_count"]
  },
  
  // --- Multi-column trip queries ---
  {
    query: "Show tipper, excavator, route and trips for today",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["tipper_id", "excavator", "route_or_face", "trip_count", "trip_date"]
  },
  {
    query: "List all equipment and locations for shift C",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["tipper_id", "excavator", "route_or_face", "shift"]
  },
  
  // =================================================================
  // OPTIMIZATION QUERIES (optimizer.ts)
  // =================================================================
  
  {
    query: "I have to pick 1 excavator and 3 tippers which combination should I take",
    expectedTask: "optimize",
    expectedIntent: "EQUIPMENT_OPTIMIZATION"
  },
  {
    query: "Recommend best equipment combination for 2 excavators and 5 tippers",
    expectedTask: "optimize",
    expectedIntent: "EQUIPMENT_OPTIMIZATION"
  },
  {
    query: "Which excavator and tipper pair performs best?",
    expectedTask: "optimize",
    expectedIntent: "EQUIPMENT_OPTIMIZATION"
  },
  {
    query: "Forecast production for next 7 days",
    expectedTask: "optimize",
    expectedIntent: "FORECASTING"
  },
  {
    query: "Predict next week's trip count",
    expectedTask: "optimize",
    expectedIntent: "FORECASTING"
  },
  {
    query: "Estimate future production for next 30 days",
    expectedTask: "optimize",
    expectedIntent: "FORECASTING"
  },
  {
    query: "What equipment allocation would you recommend?",
    expectedTask: "optimize",
    expectedIntent: "EQUIPMENT_OPTIMIZATION"
  },
  
  // =================================================================
  // CHART/VISUALIZATION QUERIES
  // =================================================================
  
  {
    query: "Show me a bar chart of daily production",
    expectedIntent: "CHART_VISUALIZATION",
    columns: ["date", "qty_ton"]
  },
  {
    query: "Plot tonnage over time",
    expectedIntent: "CHART_VISUALIZATION",
    columns: ["date", "qty_ton"]
  },
  {
    query: "Graph trip counts by shift",
    expectedIntent: "CHART_VISUALIZATION",
    columns: ["shift", "trip_count"]
  },
  {
    query: "Visualize equipment utilization trends",
    expectedIntent: "CHART_VISUALIZATION",
    columns: ["date", "excavator", "dumper"]
  },
  {
    query: "Show me a line graph of monthly production",
    expectedIntent: "CHART_VISUALIZATION",
    columns: ["date", "qty_ton"]
  },
  
  // =================================================================
  // COMPLEX MULTI-TABLE QUERIES
  // =================================================================
  
  {
    query: "Show production and which tippers contributed to it",
    expectedTables: ["production_summary", "trip_summary_by_date"],
    expectedIntent: "DATA_RETRIEVAL"
  },
  {
    query: "Total tonnage and trips by equipment for shift A",
    expectedTables: ["production_summary", "trip_summary_by_date"],
    expectedIntent: "AGGREGATION_QUERY"
  },
  
  // =================================================================
  // TOP/BOTTOM QUERIES
  // =================================================================
  
  {
    query: "Show top 5 tippers by trip count",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "ORDINAL_ROW_QUERY",
    columns: ["tipper_id", "trip_count"]
  },
  {
    query: "What are the bottom 3 shifts by production?",
    expectedTable: "production_summary",
    expectedIntent: "ORDINAL_ROW_QUERY",
    columns: ["shift", "qty_ton"]
  },
  {
    query: "List top 10 excavators by productivity",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "ORDINAL_ROW_QUERY",
    columns: ["excavator", "trip_count"]
  },
  
  // =================================================================
  // COMPARISON QUERIES
  // =================================================================
  
  {
    query: "Compare this week vs last week production",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["date", "qty_ton"]
  },
  {
    query: "How does shift A compare to shift B?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["shift", "qty_ton", "total_trips"]
  },
  {
    query: "Compare BB-44 vs BB-40 performance",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["tipper_id", "trip_count"]
  },
  
  // =================================================================
  // ADVISORY/RAG QUERIES (should route to RAG)
  // =================================================================
  
  {
    query: "How do I improve production efficiency?",
    expectedTask: "rag",
    expectedIntent: "ADVISORY_QUERY"
  },
  {
    query: "What are the best practices for equipment maintenance?",
    expectedTask: "rag",
    expectedIntent: "ADVISORY_QUERY"
  },
  {
    query: "Safety procedures for excavator operations",
    expectedTask: "rag",
    expectedIntent: "ADVISORY_QUERY"
  },
  {
    query: "How should I optimize haul routes?",
    expectedTask: "rag",
    expectedIntent: "ADVISORY_QUERY"
  },
  
  // =================================================================
  // EDGE CASES & AMBIGUOUS QUERIES
  // =================================================================
  
  {
    query: "Show me everything",
    expectedIntent: "DATA_RETRIEVAL",
    note: "Ambiguous - should default to recent production_summary"
  },
  {
    query: "What happened yesterday?",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["date"]
  },
  {
    query: "Give me the numbers",
    expectedIntent: "DATA_RETRIEVAL",
    note: "Very ambiguous"
  },
  {
    query: "trucks",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["tipper_id"]
  },
  {
    query: "production",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["qty_ton", "date"]
  },
  
  // =================================================================
  // NATURAL LANGUAGE VARIATIONS
  // =================================================================
  
  {
    query: "Can you tell me how much we produced last month?",
    expectedTable: "production_summary",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["qty_ton", "date"]
  },
  {
    query: "I'd like to see the trip data for BB-44",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "EQUIPMENT_SPECIFIC_PRODUCTION",
    columns: ["tipper_id", "trip_count"]
  },
  {
    query: "What's going on with shift B today?",
    expectedTable: "production_summary",
    expectedIntent: "DATA_RETRIEVAL",
    columns: ["shift", "date"]
  },
  {
    query: "Could you show me which excavators are performing well?",
    expectedTable: "trip_summary_by_date",
    expectedIntent: "AGGREGATION_QUERY",
    columns: ["excavator", "trip_count"]
  }
];

// Export for use in tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { comprehensiveTestQueries };
}

console.log(`Generated ${comprehensiveTestQueries.length} comprehensive test queries covering:`);
console.log(`- production_summary columns: date, shift, excavator, dumper, grader, dozer, qty_ton, qty_m3, total_trips, trip_count_for_mining, trip_count_for_reclaim`);
console.log(`- trip_summary_by_date columns: trip_date, shift, tipper_id, excavator, route_or_face, trip_count`);
console.log(`- All major intents: MONTHLY_SUMMARY, AGGREGATION_QUERY, DATA_RETRIEVAL, EQUIPMENT_OPTIMIZATION, FORECASTING, CHART_VISUALIZATION, etc.`);
console.log(`- Edge cases: ambiguous queries, single-word queries, natural language variations`);
