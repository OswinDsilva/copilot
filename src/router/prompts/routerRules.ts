// routerRules.ts
// Prompt template for LLM-based query routing
// Decides whether query should be SQL, RAG, or optimization

/**
 * Build routing prompt for LLM to decide task type
 * @param question User's question
 * @param schema Database schema
 * @returns Formatted prompt string
 */
export function routerRulesPrompt(question: string, schema: any): string {
  return `You are a mining operations query router. Analyze this question and decide whether it should be answered via SQL database query or RAG (document retrieval).

Available database schema:
${JSON.stringify(schema, null, 2)}

IMPORTANT TABLE INFO:
- "trips" table: Contains mining operational data (trip_number, dump_yard, shift, equipment, material, quantity, date, time)
- "equipment" table: Equipment tracking data
- "production_summary" table: Daily production metrics (date, shift, qty_ton, qty_m3, target_ton, target_m3)
- "trip_summary_by_date" table: Trip-level data by vehicle (trip_date, shift, tipper_id, excavator, route_or_face, trip_count)
- "uploaded_files" table: File metadata (filename, upload time, etc.)
- "chat_history" table: Chat conversation history
- "rag_chunks" table: Document chunks for RAG search
- "users" table: User information

CRITICAL TABLE SELECTION:
Rule 1: production_summary → Total/daily/shift/monthly production, target vs actual (WITHOUT equipment details)
Rule 2: trip_summary_by_date → Specific tipper/truck/excavator/route queries
Rule 3: BOTH tables → Production totals AND equipment breakdown (JOIN on date + shift)

User question: "${question}"

Respond ONLY with valid JSON in this exact format:
{
  "task": "sql" or "rag",
  "confidence": 0.0 to 1.0,
  "tables": ["table1", "table2"],
  "columns": ["col1", "col2"],
  "filters": ["filter conditions"],
  "metrics": ["metrics to calculate"],
  "time_range": "time period if mentioned",
  "keywords": ["key search terms"],
  "namespaces": ["combined"],
  "reason": "brief explanation"
}

CRITICAL NAMESPACE RULES:
- For production data queries with months (January, February, March, April, May, June): Use "namespaces": ["production_summary"]
- For general document queries: Use "namespaces": ["combined"]
- The namespace determines which indexed data to search

CRITICAL ROUTING RULES - PRIORITY ORDER:

PRIORITY 0 - Choose OPTIMIZATION (task: "optimize") for EQUIPMENT SELECTION questions:
- Questions about "which excavator", "which tipper", "which combination", "select equipment", "choose equipment"
- Questions with "should I pick", "should I take", "best combination", "optimal combination"
- Questions about "excavator and tipper", "excavator with tipper", "equipment pairing"
- Examples: "I have to pick 1 excavator and 3 tippers which combination should I take"
- Questions asking to "forecast", "predict", "projection" about production or trips
- Examples: "forecast next week production", "predict trips for next 7 days"

PRIORITY 1 - Choose SQL (task: "sql") for VISUALIZATION/CHART questions:
- ANY question with "graph", "chart", "plot", "visualize", "visualization", "draw", "overlay"
- Questions about "bar chart", "line graph", "pie chart", "histogram"
- Questions asking to "show on graph", "plot over time", "chart by", "graph by"
- Questions with "average line", "mean line", "trend line", "overlay average", "add mean"
- Multi-series charts: "with different colors", "separate by shift", "by shift", "by equipment", "color coded"
- These ALWAYS need SQL for calculations and data aggregation
- Examples: "overlay average line on graph", "show bar chart", "plot production over time", "show shift A, B, C with different colors"

PRIORITY 2 - Choose SQL (task: "sql") for CALCULATIONS/AGGREGATIONS:
- Questions with "average", "mean", "median", "sum", "total", "count", "max", "min"
- Questions asking for "highest", "lowest", "top", "bottom", "most", "least"
- Calculations: "calculate", "compute", "what is the average", "find the mean"
- Comparisons: "compare", "versus", "vs", "difference between"
- These need SQL for database aggregation functions

PRIORITY 3 - Choose RAG (task: "rag") for ADVISORY/PROCEDURAL questions:
- Questions starting with "how to", "how do I", "how can I", "how should I"
- Questions about "best practice", "best way", "optimize", "improve", "reduce", "increase"
- Questions asking "what is the process", "what are the steps", "guidelines", "procedures"
- Questions about "safety", "policy", "standard operating procedure", "SOP"
- Conceptual questions requiring advice, not data retrieval

PRIORITY 4 - Choose SQL (task: "sql") for DATA RETRIEVAL questions:
- Listing trips or equipment: "list trips", "show equipment", "display trips"
- Real-time filtering: "by shift", "by dump yard", "by equipment", "where"
- Time-based on trips table: "trips today", "trips yesterday", "trips last week"
- Questions asking for specific numbers or records from database tables

KEY DISTINCTION:
- "overlay average line on graph" → SQL (needs calculation + visualization)
- "show bar chart for January" → SQL (needs aggregation + chart data)
- "calculate average QTY TON" → SQL (needs aggregation function)
- "show trips for today" → SQL (trips table for real-time data)
- "how to improve production" → RAG (requesting advice)

EXAMPLES for SQL:
- "overlay average line on this graph for Jan 2025 QTY TON" → task: "sql"
- "show shift A, B, C production with different colors" → task: "sql"
- "have shift A, B, C production data with different color" → task: "sql"
- "show bar chart of production by shift" → task: "sql"
- "graph production over time" → task: "sql"
- "plot production separated by shift" → task: "sql"
- "color coded chart by equipment" → task: "sql"
- "calculate average tonnage" → task: "sql"
- "what is the mean production" → task: "sql"
- "how many trips today" → task: "sql"
- "trips by tipper" → task: "sql"
- "which tipper did the most work" → task: "sql"
- "show trips for TIPPER-01" → task: "sql"
- "truck trips on January 1st" → task: "sql"
- "dumper trips by shift" → task: "sql"
- "vehicle trip count" → task: "sql"
- "total tonnage" → task: "sql"
- "list equipment" → task: "sql"
- "highest production day" → task: "sql"

EXAMPLES for RAG:
- "how to improve my production per day" → task: "rag", namespaces: ["combined"]
- "what is the best practice for equipment maintenance" → task: "rag", namespaces: ["combined"]
- "how can I optimize haul routes" → task: "rag", namespaces: ["combined"]`;
}
