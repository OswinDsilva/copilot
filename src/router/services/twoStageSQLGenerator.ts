/**
 * Two-Stage SQL Generator
 * 
 * Stage 1: Schema Resolution
 * - LLM determines which table(s) to use
 * - LLM selects which columns are needed
 * - Output: Validated table/column mapping
 * 
 * Stage 2: SQL Generation
 * - Uses ONLY the validated columns from Stage 1
 * - Generates SQL with a focused, shorter prompt
 * - Cannot hallucinate columns (validated against actual schema)
 * 
 * Benefits:
 * - Prevents column hallucination (validated before SQL generation)
 * - Shorter, focused prompts for each stage
 * - Better accuracy with GPT-3.5-turbo
 */

import { retryWithBackoff, llmCircuitBreaker } from '../helpers/errorHandling';

// ============================================================================
// TYPES
// ============================================================================

interface SchemaColumn {
  name: string;
  type: string;
  description?: string;
}

interface TableSchema {
  name: string;
  columns: SchemaColumn[];
}

interface SchemaResolution {
  primaryTable: string;
  primaryColumns: string[];
  secondaryTable?: string;
  secondaryColumns?: string[];
  joinCondition?: string;
  needsJoin: boolean;
  aggregationType: 'none' | 'sum' | 'avg' | 'count' | 'group';
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
  dateFilter?: {
    column: string;
    type: 'specific' | 'range' | 'month' | 'year';
    value: string;
    endValue?: string;
  };
  shiftFilter?: string[];
  equipmentFilter?: { column: string; values: string[] };
}

// ============================================================================
// HARDCODED SCHEMA (Single Source of Truth)
// ============================================================================

export const MINING_SCHEMA: TableSchema[] = [
  {
    name: 'production_summary',
    columns: [
      { name: 'id', type: 'uuid', description: 'Primary key' },
      { name: 'user_id', type: 'uuid', description: 'User ID foreign key' },
      { name: 'date', type: 'date', description: 'Production date (YYYY-MM-DD)' },
      { name: 'shift', type: 'text', description: 'Shift identifier (A, B, C, Day, Night)' },
      { name: 'excavator', type: 'numeric', description: 'Excavator hours (NOT equipment ID!)' },
      { name: 'dumper', type: 'numeric', description: 'Dumper hours (NOT equipment ID!)' },
      { name: 'trip_count_for_mining', type: 'numeric', description: 'Mining trip count' },
      { name: 'qty_ton', type: 'numeric', description: 'Production tonnage' },
      { name: 'trip_count_for_reclaim', type: 'numeric', description: 'Reclaim trip count' },
      { name: 'qty_m3', type: 'numeric', description: 'Production cubic meters' },
      { name: 'total_trips', type: 'numeric', description: 'Total trip count for the shift' },
      { name: 'grader', type: 'numeric', description: 'Grader hours' },
      { name: 'dozer', type: 'numeric', description: 'Dozer hours' },
      { name: 'created_at', type: 'timestamp', description: 'Record creation timestamp' },
    ]
  },
  {
    name: 'trip_summary_by_date',
    columns: [
      { name: 'id', type: 'uuid', description: 'Primary key' },
      { name: 'user_id', type: 'uuid', description: 'User ID foreign key' },
      { name: 'trip_date', type: 'date', description: 'Trip date (YYYY-MM-DD) - NOT "date"!' },
      { name: 'shift', type: 'text', description: 'Shift identifier (A, B, C)' },
      { name: 'tipper_id', type: 'text', description: 'Tipper vehicle ID (e.g., BB-44, BB-40)' },
      { name: 'excavator', type: 'text', description: 'Excavator ID (e.g., EX-189, EX-190)' },
      { name: 'route_or_face', type: 'text', description: 'Route or mining face name' },
      { name: 'trip_count', type: 'integer', description: 'Number of trips' },
      { name: 'remarks', type: 'text', description: 'Optional remarks/notes' },
      { name: 'created_at', type: 'timestamp', description: 'Record creation timestamp' },
    ]
  }
];

// ============================================================================
// SCHEMA VALIDATION
// ============================================================================

export function validateColumns(tableName: string, columns: string[]): { valid: string[]; invalid: string[] } {
  const table = MINING_SCHEMA.find(t => t.name === tableName);
  if (!table) {
    return { valid: [], invalid: columns };
  }
  
  const validColumnNames = table.columns.map(c => c.name);
  const valid: string[] = [];
  const invalid: string[] = [];
  
  for (const col of columns) {
    // Handle aliased columns (e.g., "SUM(qty_ton) AS total")
    const baseCol = col.replace(/^(SUM|AVG|COUNT|MIN|MAX|STRING_AGG)\(([^)]+)\).*$/i, '$2')
                       .replace(/\s+AS\s+\w+$/i, '')
                       .trim();
    
    if (validColumnNames.includes(baseCol) || baseCol === '*') {
      valid.push(col);
    } else {
      invalid.push(col);
    }
  }
  
  return { valid, invalid };
}

export function getTableColumns(tableName: string): string[] {
  const table = MINING_SCHEMA.find(t => t.name === tableName);
  return table ? table.columns.map(c => c.name) : [];
}

export function getDateColumn(tableName: string): string {
  if (tableName === 'production_summary') return 'date';
  if (tableName === 'trip_summary_by_date') return 'trip_date';
  return 'date';
}

// ============================================================================
// STAGE 1: SCHEMA RESOLUTION
// ============================================================================

const STAGE1_PROMPT = `You are a database schema resolver. Your job is to determine which tables and columns are needed for a query.

CRITICAL: ONLY use columns from the lists below. DO NOT invent or assume columns exist.

AVAILABLE TABLES AND COLUMNS:

TABLE: production_summary
  - id, user_id (system columns - rarely needed)
  - date (date): Production date - USE "date" NOT "trip_date"
  - shift (text): Shift A, B, C, Day, Night
  - excavator (numeric): Excavator HOURS (NOT equipment ID!)
  - dumper (numeric): Dumper HOURS (NOT equipment ID!)
  - trip_count_for_mining (numeric): Mining trip count
  - qty_ton (numeric): Production tonnage
  - trip_count_for_reclaim (numeric): Reclaim trip count
  - qty_m3 (numeric): Production cubic meters
  - total_trips (numeric): Total trip count
  - grader, dozer (numeric): Equipment hours
  - created_at (timestamp): Record timestamp

TABLE: trip_summary_by_date
  - id, user_id (system columns - rarely needed)
  - trip_date (date): Trip date - USE "trip_date" NOT "date"
  - shift (text): Shift A, B, or C
  - tipper_id (text): Tipper ID like BB-44, BB-40
  - excavator (text): Excavator ID like EX-189, EX-190
  - route_or_face (text): Route or mining face
  - trip_count (integer): Number of trips
  - remarks (text): Optional notes
  - created_at (timestamp): Record timestamp

CRITICAL RULES:
1. ONLY use columns listed above - NO OTHER COLUMNS EXIST
2. production_summary uses "date" column (NOT "trip_date")
3. trip_summary_by_date uses "trip_date" column (NOT "date")
4. trip_summary_by_date has NO tonnage columns (qty_ton, qty_m3)
5. There is NO "machine_types", "equipment_type", or "vehicle_type" column
6. For equipment replacement queries, use trip_count to find best alternatives
7. For "production" or "tonnage" queries → production_summary
8. For equipment breakdowns (specific tippers, excavators) → trip_summary_by_date
9. JOIN only if user asks for BOTH production metrics AND equipment details
10. GROUPING DETECTION:
    - If user asks "by [dimension]", "in each [dimension]", "per [dimension]", "for each [dimension]"
    - Examples: "by shift", "in each shift", "per tipper", "for each date"
    - Set aggregationType to "group" (requires GROUP BY in SQL)
11. DATE COLUMN INCLUSION:
    - When filtering by specific date(s), ALWAYS include the date column in primaryColumns
    - Examples: "trips on Jan 15" → include "trip_date" in primaryColumns
    - "production on March 5" → include "date" in primaryColumns
12. EQUIPMENT COLUMN INCLUSION:
    - When filtering by specific equipment ID(s), ALWAYS include the equipment column in primaryColumns
    - Examples: "trips by EX-139" → include "excavator" in primaryColumns
    - "trips by BB-53" → include "tipper_id" in primaryColumns
    - "BB-53 with EX-139 vs BB-52 with EX-141" → include both "tipper_id" AND "excavator"

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "primaryTable": "production_summary" or "trip_summary_by_date",
  "primaryColumns": ["column1", "column2"],
  "needsJoin": true/false,
  "secondaryTable": "table_name" (if needsJoin),
  "secondaryColumns": ["column1"] (if needsJoin),
  "aggregationType": "none" | "sum" | "avg" | "count" | "group",
  "orderDirection": "ASC" | "DESC" (if ordering needed),
  "limit": number (if limiting results)
}`;

export async function resolveSchema(
  question: string,
  parameters: Record<string, any>,
  apiKey: string
): Promise<SchemaResolution> {
  const prompt = `${STAGE1_PROMPT}

USER QUESTION: ${question}
EXTRACTED PARAMETERS: ${JSON.stringify(parameters)}

Based on the question, determine which table(s) and column(s) are needed.
Return ONLY valid JSON.`;

  try {
    const result = await llmCircuitBreaker.execute(async () => {
      return await retryWithBackoff(
        async () => {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: 'You are a schema resolver. Return ONLY valid JSON, no explanation.' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.1,
              max_tokens: 500
            })
          });

          if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
          }

          const data = await response.json();
          const content = data.choices[0].message.content.trim();
          
          // Extract JSON
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('No JSON in response');
          }
          
          return JSON.parse(jsonMatch[0]) as SchemaResolution;
        },
        { operation: 'Schema Resolution', query: question },
        { maxAttempts: 2, initialDelay: 500, timeout: 15000 }
      );
    });

    // VALIDATE the resolution against actual schema
    const validated = validateSchemaResolution(result);
    return validated;

  } catch (error) {
    console.error('[Stage 1] Schema resolution failed:', error);
    // Fallback to rule-based resolution
    return fallbackSchemaResolution(question, parameters);
  }
}

function validateSchemaResolution(resolution: SchemaResolution): SchemaResolution {
  // Validate primary table
  const primaryTable = MINING_SCHEMA.find(t => t.name === resolution.primaryTable);
  if (!primaryTable) {
    console.warn(`[Schema Validation] Invalid table: ${resolution.primaryTable}, defaulting to production_summary`);
    resolution.primaryTable = 'production_summary';
  }

  // Validate primary columns
  const { valid: validPrimary, invalid: invalidPrimary } = validateColumns(
    resolution.primaryTable, 
    resolution.primaryColumns || []
  );
  
  if (invalidPrimary.length > 0) {
    console.warn(`[Schema Validation] Invalid columns removed: ${invalidPrimary.join(', ')}`);
  }
  
  resolution.primaryColumns = validPrimary.length > 0 
    ? validPrimary 
    : getTableColumns(resolution.primaryTable);

  // Validate secondary table if joining
  if (resolution.needsJoin && resolution.secondaryTable) {
    const secondaryTable = MINING_SCHEMA.find(t => t.name === resolution.secondaryTable);
    if (!secondaryTable) {
      console.warn(`[Schema Validation] Invalid secondary table: ${resolution.secondaryTable}, disabling join`);
      resolution.needsJoin = false;
      resolution.secondaryTable = undefined;
      resolution.secondaryColumns = undefined;
    } else if (resolution.secondaryColumns) {
      const { valid: validSecondary } = validateColumns(
        resolution.secondaryTable,
        resolution.secondaryColumns
      );
      resolution.secondaryColumns = validSecondary;
    }
  }

  return resolution;
}

function fallbackSchemaResolution(question: string, _parameters: Record<string, any>): SchemaResolution {
  const q = question.toLowerCase();
  
  // Equipment-specific queries → trip_summary_by_date
  const hasEquipment = /tipper|excavator|bb-\d+|ex-\d+|equipment|vehicle|truck/i.test(q);
  const hasRoute = /route|face|bench|haul/i.test(q);
  
  // Production metrics → production_summary
  const hasProduction = /production|tonnage|qty_ton|qty_m3|cubic|target/i.test(q);
  
  // Determine primary table
  let primaryTable = 'production_summary';
  if ((hasEquipment || hasRoute) && !hasProduction) {
    primaryTable = 'trip_summary_by_date';
  }
  
  // Determine if join needed
  const needsJoin = hasProduction && (hasEquipment || /which tipper|which excavator|what equipment/i.test(q));
  
  return {
    primaryTable,
    primaryColumns: getTableColumns(primaryTable),
    needsJoin,
    secondaryTable: needsJoin ? 'trip_summary_by_date' : undefined,
    secondaryColumns: needsJoin ? ['tipper_id', 'excavator', 'trip_count'] : undefined,
    aggregationType: /sum|total|average|avg|count/i.test(q) ? 'sum' : 'none',
  };
}

// ============================================================================
// STAGE 2: SQL GENERATION (with validated schema)
// ============================================================================

function buildStage2Prompt(
  question: string,
  resolution: SchemaResolution,
  parameters: Record<string, any>
): string {
  const dateCol = getDateColumn(resolution.primaryTable);
  
  // Build column list for the prompt
  const primaryCols = resolution.primaryColumns.join(', ');
  const secondaryCols = resolution.secondaryColumns?.join(', ') || '';
  
  let prompt = `Generate a PostgreSQL SELECT query.

VALIDATED SCHEMA (use ONLY these columns):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Table: ${resolution.primaryTable}
Columns: ${primaryCols}
Date column: ${dateCol}
`;

  if (resolution.needsJoin && resolution.secondaryTable) {
    const secondaryDateCol = getDateColumn(resolution.secondaryTable);
    prompt += `
Secondary Table: ${resolution.secondaryTable}
Secondary Columns: ${secondaryCols}
Secondary Date column: ${secondaryDateCol}
JOIN ON: p.${dateCol} = t.${secondaryDateCol} AND p.shift = t.shift
Use aliases: ${resolution.primaryTable} AS p, ${resolution.secondaryTable} AS t
`;
  }

  prompt += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXTRACTED PARAMETERS:
${JSON.stringify(parameters, null, 2)}

${parameters.equipment_ids && parameters.equipment_ids.length > 0 ? `
⚠️ CRITICAL: Equipment IDs detected: ${parameters.equipment_ids.join(', ')}
${(() => {
  const tippers = parameters.equipment_ids.filter((id: string) => /^(BB|DT)-/i.test(id));
  const excavators = parameters.equipment_ids.filter((id: string) => /^EX-/i.test(id));
  
  // Check if this is a combination comparison query (multiple tippers AND multiple excavators)
  if (tippers.length > 1 && excavators.length > 1 && question.toLowerCase().includes(' or ')) {
    return `🔴 COMBINATION COMPARISON DETECTED:
This is comparing equipment PAIRS/COMBINATIONS.
You MUST use parentheses to pair tipper with excavator:
WHERE (tipper_id = '${tippers[0]}' AND excavator = '${excavators[0]}')
   OR (tipper_id = '${tippers[1]}' AND excavator = '${excavators[1]}')
${tippers.length > 2 || excavators.length > 2 ? `   OR (continue pattern for remaining pairs)` : ''}
THEN use: GROUP BY tipper_id, excavator
DO NOT use: WHERE excavator = 'X' OR tipper_id = 'Y' (this is WRONG - matches ANY equipment)`;
  }
  
  // Single equipment query
  return `YOU MUST filter by these equipment IDs in the WHERE clause:
${parameters.equipment_ids.map((id: string) => {
  if (id.match(/^(BB|DT)-/i)) {
    return `- For ${id}: Add WHERE tipper_id = '${id}'`;
  } else if (id.match(/^EX-/i)) {
    return `- For ${id}: Add WHERE excavator = '${id}'`;
  }
  return '';
}).join('\n')}`;
})()}
` : ''}

USER QUESTION: ${question}

CRITICAL RULES:
1. Use ONLY the columns listed above - NO OTHER COLUMNS EXIST
2. DO NOT invent columns like "machine_types", "equipment_type", "vehicle_type"

3. EQUIPMENT REPLACEMENT/ALTERNATIVE QUERIES (CRITICAL):
   When user asks "replace X", "alternative to X", "substitute for X", "X went down":
   - The goal is to find OTHER equipment that can replace X
   - IDENTIFY equipment type by prefix: BB-/DT- = tipper, EX- = excavator
   - For tipper replacement: SELECT tipper_id (NOT excavator)
   - For excavator replacement: SELECT excavator (NOT tipper_id)
   - EXCLUDE the mentioned equipment: WHERE tipper_id <> 'BB-53' OR WHERE excavator <> 'EX-139'
   - Rank by performance: ORDER BY SUM(trip_count) DESC or SUM(qty_ton) DESC
   - LIMIT to top candidates: LIMIT 5
   - Example for "replace BB-53" (TIPPER):
     SELECT tipper_id, SUM(trip_count) as total_trips
     FROM trip_summary_by_date
     WHERE tipper_id <> 'BB-53'
     GROUP BY tipper_id
     ORDER BY SUM(trip_count) DESC
     LIMIT 5
   - Example for "replace EX-139" (EXCAVATOR):
     SELECT excavator, SUM(trip_count) as total_trips
     FROM trip_summary_by_date
     WHERE excavator <> 'EX-139'
     GROUP BY excavator
     ORDER BY SUM(trip_count) DESC
     LIMIT 5
   - NEVER query tipper_id when replacing excavator
   - NEVER query excavator when replacing tipper
   - NEVER use contradictory logic like: tipper_id = 'X' AND tipper_id <> 'X'

3b. EQUIPMENT COMBINATION COMPARISON QUERIES (CRITICAL):
   When user asks "should I use X with Y or A with B", "X and Y or A and B":
   - Goal: Compare performance of specific PAIRED equipment combinations
   - MANDATORY: Use parentheses to group each combination with AND
   - WRONG: WHERE excavator = 'EX-141' OR tipper_id = 'BB-53' ❌ (This matches ANY equipment)
   - CORRECT: WHERE (tipper_id = 'BB-53' AND excavator = 'EX-139') OR (tipper_id = 'BB-52' AND excavator = 'EX-141') ✅
   - ALWAYS use SUM(trip_count) and GROUP BY both tipper_id AND excavator
   - Example: "should I use BB-53 with EX-139 or BB-52 with EX-141"
     SELECT tipper_id, excavator, SUM(trip_count) as total_trips
     FROM trip_summary_by_date
     WHERE (tipper_id = 'BB-53' AND excavator = 'EX-139') 
        OR (tipper_id = 'BB-52' AND excavator = 'EX-141')
     GROUP BY tipper_id, excavator
     ORDER BY total_trips DESC
   - Example: "EX-141 and BB-53 or EX-139 and BB-52"
     SELECT tipper_id, excavator, SUM(trip_count) as total_trips
     FROM trip_summary_by_date
     WHERE (tipper_id = 'BB-53' AND excavator = 'EX-141')
        OR (tipper_id = 'BB-52' AND excavator = 'EX-139')
     GROUP BY tipper_id, excavator
     ORDER BY total_trips DESC

3c. SINGLE EQUIPMENT TYPE COMPARISON (CRITICAL):
   When user compares equipment of SAME type (e.g., "BB-53 or BB-52", "EX-141 vs EX-139"):
   - Compare the SAME column for both, using IN() or OR
   - ALWAYS use SUM(trip_count) and GROUP BY the equipment column
   - Example: "which is better, BB-53 or BB-52"
     SELECT tipper_id, SUM(trip_count) as total_trips
     FROM trip_summary_by_date
     WHERE tipper_id IN ('BB-53', 'BB-52')
     GROUP BY tipper_id
     ORDER BY total_trips DESC
   - Example: "compare EX-141 vs EX-139"
     SELECT excavator, SUM(trip_count) as total_trips
     FROM trip_summary_by_date
     WHERE excavator IN ('EX-141', 'EX-139')
     GROUP BY excavator
     ORDER BY total_trips DESC

4. AGGREGATION AND GROUPING (CRITICAL):
   When user asks about totals/counts "by" or "in each" or "per" dimension:
   - "trips in each shift" → GROUP BY shift
   - "production by shift" → GROUP BY shift
   - "trips per tipper" → GROUP BY tipper_id
   - "tonnage by date" → GROUP BY date/trip_date
   - Use SUM() for totals: SUM(trip_count), SUM(qty_ton)
   - Use AVG() when user asks for "average": AVG(trip_count), AVG(qty_ton)
   - Example: "trips on Jan 15 in each shift"
     SELECT shift, SUM(trip_count) as total_trips
     FROM trip_summary_by_date
     WHERE trip_date = '2025-01-15'
     GROUP BY shift
     ORDER BY shift
   - CRITICAL: If user mentions "average", "avg", "mean" - use AVG() function
   - Example: "compare total and average production by shift"
     SELECT shift, SUM(qty_ton) as total_production, AVG(qty_ton) as average_production
     FROM production_summary
     GROUP BY shift

4b. SHIFT QUERIES (CRITICAL - ALL SHIFTS):
   - When user asks about "shift A, B, C" or "all shifts" - include ALL mentioned shifts
   - NEVER hardcode just ('A', 'B') - always include all shifts mentioned
   - Default to ('A', 'B', 'C') when user says "all shifts" or "each shift"
   - Example: "Show shift A, B, C production"
     SELECT shift, SUM(qty_ton) as total_production
     FROM production_summary
     WHERE shift IN ('A', 'B', 'C')
     GROUP BY shift

4c. MONTH AGGREGATION (CRITICAL - READABLE NAMES):
   - When user asks "by month", "per month", "production by month":
   - Use TO_CHAR() to display readable month names instead of timestamps
   - WRONG: SELECT DATE_TRUNC('month', date) AS month ❌ (returns timestamp like 2025-01-01)
   - CORRECT: SELECT TO_CHAR(date, 'Month YYYY') AS month ✅ (returns 'January 2025')
   - Alternative: SELECT TO_CHAR(date, 'Mon-YY') AS month (returns 'Jan-25')
   - ALWAYS GROUP BY the same expression used in SELECT
   - Example: "chart production by month"
     SELECT TO_CHAR(date, 'Month YYYY') AS month, SUM(qty_ton) AS total_production
     FROM production_summary
     GROUP BY TO_CHAR(date, 'Month YYYY')
     ORDER BY MIN(date)
   - Example: "show tonnage per month"
     SELECT TO_CHAR(date, 'Mon-YY') AS month, SUM(qty_ton) AS total_tonnage
     FROM production_summary
     GROUP BY TO_CHAR(date, 'Mon-YY')
     ORDER BY MIN(date)

5. For date filtering:
   - MANDATORY: When filtering by specific date(s), ALWAYS include date column in SELECT
   - Specific date: SELECT ${dateCol}, ... WHERE ${dateCol} = 'YYYY-MM-DD'
   - Multiple dates: SELECT ${dateCol}, ... WHERE ${dateCol} IN ('2025-01-15', '2025-01-21')
   - Date range: SELECT ${dateCol}, ... WHERE ${dateCol} BETWEEN 'start' AND 'end'
   - Month: WHERE EXTRACT(MONTH FROM ${dateCol}) = N AND EXTRACT(YEAR FROM ${dateCol}) = YYYY
   - Example: "trips on Jan 15 and 21"
     SELECT trip_date, SUM(trip_count) as total_trips
     FROM trip_summary_by_date
     WHERE trip_date IN ('2025-01-15', '2025-01-21')
     GROUP BY trip_date
6. For shift filtering:
   - CRITICAL: Use shift parameters from extracted data - DO NOT hardcode
   - If parameters.shift = ['A', 'B'] → WHERE shift IN ('A', 'B')
   - If parameters.shift = ['A', 'B', 'C'] → WHERE shift IN ('A', 'B', 'C')
   - If parameters.shift = ['A'] → WHERE shift IN ('A')
   - NEVER assume only A and B exist - shift C is valid and must be included when specified
   - WRONG: WHERE shift IN ('A', 'B') when user asked for "shift A, B, C" ❌
   - CORRECT: WHERE shift IN ('A', 'B', 'C') when user asked for "shift A, B, C" ✅
   - If no shift specified → No shift filter (returns all shifts)

7. For equipment filtering (when looking FOR specific equipment, not replacing it):
   - MANDATORY: When filtering by specific equipment ID, ALWAYS include that equipment column in SELECT
   - ONLY add WHERE clause if user specifies actual equipment IDs (BB-44, EX-189, etc.)
   - "each tipper", "all tippers", "per tipper" → NO WHERE clause, just GROUP BY tipper_id
   - "each excavator", "all excavators" → NO WHERE clause, just GROUP BY excavator
   - For specific IDs:
     * BB- and DT- prefixes = TIPPERS → use tipper_id column: WHERE tipper_id = 'BB-44'
     * EX- prefix = EXCAVATORS → use excavator column: WHERE excavator = 'EX-189'
   - Example: "trips by EX-139 on Jan 15"
     SELECT excavator, trip_date, SUM(trip_count) as total_trips
     FROM trip_summary_by_date
     WHERE excavator = 'EX-139' AND trip_date = '2025-01-15'
   - Example: "trips by BB-53 on Jan 15"
     SELECT tipper_id, trip_date, SUM(trip_count) as total_trips
     FROM trip_summary_by_date
     WHERE tipper_id = 'BB-53' AND trip_date = '2025-01-15'
   - NEVER use BB-/DT- IDs with excavator column
   - NEVER use EX- IDs with tipper_id column
   - NEVER filter by generic words like WHERE tipper_id IN ('tipper')
8. Aggregation type: ${resolution.aggregationType}
9. NO markdown, NO explanation, NO semicolon at end

Return ONLY the SQL query.`;

  return prompt;
}

export async function generateSQLWithValidatedSchema(
  question: string,
  resolution: SchemaResolution,
  parameters: Record<string, any>,
  apiKey: string
): Promise<string> {
  const prompt = buildStage2Prompt(question, resolution, parameters);

  try {
    const sql = await llmCircuitBreaker.execute(async () => {
      return await retryWithBackoff(
        async () => {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: 'You are a SQL generator. Return ONLY valid PostgreSQL SQL, nothing else.' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.1,
              max_tokens: 600
            })
          });

          if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
          }

          const data = await response.json();
          let sql = data.choices[0].message.content.trim();
          
          // Clean up SQL
          sql = sql.replace(/```sql/gi, '').replace(/```/g, '').trim();
          sql = sql.replace(/;$/, '');
          
          return sql;
        },
        { operation: 'SQL Generation', query: question },
        { maxAttempts: 2, initialDelay: 500, timeout: 20000 }
      );
    });

    // Final validation: check that generated SQL only uses valid columns
    const validatedSQL = validateGeneratedSQL(sql, resolution);
    return validatedSQL;

  } catch (error) {
    console.error('[Stage 2] SQL generation failed:', error);
    throw error;
  }
}

function validateGeneratedSQL(sql: string, resolution: SchemaResolution): string {
  // Get all valid column names
  const validColumns = new Set<string>();
  
  // Add primary table columns
  for (const col of resolution.primaryColumns) {
    validColumns.add(col);
    validColumns.add(`p.${col}`);
  }
  
  // Add secondary table columns
  if (resolution.secondaryColumns) {
    for (const col of resolution.secondaryColumns) {
      validColumns.add(col);
      validColumns.add(`t.${col}`);
    }
  }
  
  // Add common valid patterns
  validColumns.add('*');
  validColumns.add('date');
  validColumns.add('trip_date');
  validColumns.add('p.date');
  validColumns.add('t.trip_date');
  
  // Check for common hallucinations and fix them
  let fixedSQL = sql;
  
  // Fix common hallucinations
  const hallucinations: [RegExp, string][] = [
    [/\btotal_tonnage\b/gi, 'qty_ton'],
    [/\btonnage\b(?!\s+AS)/gi, 'qty_ton'],
    [/\btrips\b(?!\s+AS)/gi, 'trip_count'],
    [/\bvehicle_id\b/gi, 'tipper_id'],
    [/\btruck_id\b/gi, 'tipper_id'],
    [/\bproduction_date\b/gi, resolution.primaryTable === 'production_summary' ? 'date' : 'trip_date'],
  ];
  
  for (const [pattern, replacement] of hallucinations) {
    if (pattern.test(fixedSQL)) {
      console.warn(`[SQL Validation] Fixed hallucination: ${pattern} → ${replacement}`);
      fixedSQL = fixedSQL.replace(pattern, replacement);
    }
  }
  
  // Critical fix: wrong date column for table
  if (resolution.primaryTable === 'production_summary' && /\btrip_date\b/.test(fixedSQL) && !/trip_summary_by_date/.test(fixedSQL)) {
    console.warn('[SQL Validation] Fixed: trip_date → date for production_summary');
    fixedSQL = fixedSQL.replace(/\btrip_date\b/g, 'date');
  }
  
  if (resolution.primaryTable === 'trip_summary_by_date' && /\bWHERE\s+date\b/.test(fixedSQL)) {
    console.warn('[SQL Validation] Fixed: date → trip_date for trip_summary_by_date');
    fixedSQL = fixedSQL.replace(/\bWHERE\s+date\b/g, 'WHERE trip_date');
  }
  
  // Critical fix: BB- IDs (tippers) used with excavator column
  const tipperWithExcavatorPattern = /excavator\s*=\s*['"]BB-\d+['"]|excavator\s*=\s*['"]DT-\d+['"]|excavator\s*IN\s*\([^)]*['"](?:BB|DT)-\d+['"][^)]*\)/gi;
  if (tipperWithExcavatorPattern.test(fixedSQL)) {
    console.warn('[SQL Validation] Fixed: BB-/DT- IDs moved from excavator to tipper_id column');
    fixedSQL = fixedSQL.replace(/excavator(\s*=\s*['"](?:BB|DT)-\d+['"])/gi, 'tipper_id$1');
    fixedSQL = fixedSQL.replace(/excavator(\s*IN\s*\([^)]*\))/gi, (match, group) => {
      if (/['"](?:BB|DT)-\d+['"]/.test(group)) {
        return 'tipper_id' + group;
      }
      return match;
    });
  }
  
  // Critical fix: EX- IDs (excavators) used with tipper_id column
  const excavatorWithTipperPattern = /tipper_id\s*=\s*['"]EX-\d+['"]|tipper_id\s*IN\s*\([^)]*['"]EX-\d+['"][^)]*\)/gi;
  if (excavatorWithTipperPattern.test(fixedSQL)) {
    console.warn('[SQL Validation] Fixed: EX- IDs moved from tipper_id to excavator column');
    fixedSQL = fixedSQL.replace(/tipper_id(\s*=\s*['"]EX-\d+['"])/gi, 'excavator$1');
    fixedSQL = fixedSQL.replace(/tipper_id(\s*IN\s*\([^)]*\))/gi, (match, group) => {
      if (/['"]EX-\d+['"]/.test(group)) {
        return 'excavator' + group;
      }
      return match;
    });
  }
  
  // Critical fix: Contradictory logic (col = 'X' AND col <> 'X') - always returns empty
  // This happens when LLM misunderstands "replace X" queries
  // Pattern: WHERE tipper_id = 'BB-53' AND tipper_id <> 'BB-53'
  // Should be: WHERE tipper_id <> 'BB-53' (find alternatives)
  const contradictoryPattern = /(\w+)\s*=\s*(['"][^'"]+['"])\s+AND\s+\1\s*<>\s*\2/gi;
  if (contradictoryPattern.test(fixedSQL)) {
    console.warn('[SQL Validation] Fixed: Contradictory logic (= X AND <> X) → just <> X for replacement query');
    fixedSQL = fixedSQL.replace(contradictoryPattern, '$1 <> $2');
  }
  
  // Also check reverse order: col <> 'X' AND col = 'X'
  const contradictoryPatternReverse = /(\w+)\s*<>\s*(['"][^'"]+['"])\s+AND\s+\1\s*=\s*\2/gi;
  if (contradictoryPatternReverse.test(fixedSQL)) {
    console.warn('[SQL Validation] Fixed: Contradictory logic (<> X AND = X) → just <> X for replacement query');
    fixedSQL = fixedSQL.replace(contradictoryPatternReverse, '$1 <> $2');
  }
  
  return fixedSQL;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function twoStageSQLGenerate(
  question: string,
  parameters: Record<string, any>,
  apiKey: string
): Promise<string> {
  console.log('[Two-Stage SQL] Starting...');
  console.log('[Two-Stage SQL] Question:', question);
  
  // Stage 1: Resolve schema
  console.log('[Two-Stage SQL] Stage 1: Resolving schema...');
  const resolution = await resolveSchema(question, parameters, apiKey);
  console.log('[Two-Stage SQL] Schema resolution:', JSON.stringify(resolution, null, 2));
  
  // Stage 2: Generate SQL with validated schema
  console.log('[Two-Stage SQL] Stage 2: Generating SQL...');
  const sql = await generateSQLWithValidatedSchema(question, resolution, parameters, apiKey);
  console.log('[Two-Stage SQL] Generated SQL:', sql);
  
  return sql;
}
