// sqlGenerationRules.ts
// Trimmed prompt template for legacy SQL generation fallback
// The primary SQL generation now uses Two-Stage generator in twoStageSQLGenerator.ts

/**
 * Build SQL generation prompt (legacy fallback)
 * This is only used when the Two-Stage generator fails
 */
export function sqlGenerationPrompt(
  structured: any,
  decision: any,
  _schema: any,
  conversationContext: string
): string {
  const intent = decision.intent || 'UNKNOWN';
  
  return `Generate a PostgreSQL SELECT query.

${conversationContext}

QUESTION: ${structured.question || JSON.stringify(structured)}
INTENT: ${intent}
PARAMETERS: ${JSON.stringify(decision.parameters || {})}

CRITICAL SCHEMA RULES:
===========================================================

TABLE: production_summary
  - date (date) - USE "date" NOT "trip_date"!
  - shift (text): A, B, C
  - qty_ton (numeric): Production tonnage
  - qty_m3 (numeric): Production cubic meters
  - target_ton, target_m3 (numeric): Targets
  - total_trips (integer): Trip count
  - excavator, dumper (integer): Equipment counts

TABLE: trip_summary_by_date
  - trip_date (date) - USE "trip_date" NOT "date"!
  - shift (text): A, B, C
  - tipper_id (text): e.g., BB-44, BB-40
  - excavator (text): e.g., EX-189, EX-190
  - route_or_face (text): Route/mining face
  - trip_count (integer): Number of trips
  - NO qty_ton or qty_m3 columns!

===========================================================

TABLE SELECTION:
1. "production", "tonnage", "qty_ton", "qty_m3" -> production_summary
2. "tipper", "excavator", "equipment", "BB-", "EX-" -> trip_summary_by_date
3. Both production AND equipment details -> JOIN both tables

JOIN SYNTAX (when needed):
  FROM production_summary AS p
  JOIN trip_summary_by_date AS t ON p.date = t.trip_date AND p.shift = t.shift

DATE FILTERS:
  - Specific date: WHERE date = '2025-01-15'
  - Month: WHERE EXTRACT(MONTH FROM date) = 1 AND EXTRACT(YEAR FROM date) = 2025
  - Range: WHERE date BETWEEN '2025-01-01' AND '2025-01-31'

COMMON MISTAKES TO AVOID:
- Using "date" with trip_summary_by_date (use "trip_date")
- Using "trip_date" with production_summary (use "date")
- Inventing columns like "total_tonnage", "tonnage", "trips"
- Using qty_ton with trip_summary_by_date (doesn't exist)

Return ONLY the SQL query, no markdown or explanation.`;
}
