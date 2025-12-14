/**
 * Regex patterns for query detection
 */

export const PATTERNS = {
  // Aggregation patterns
  TOTAL_QUERY: /\b(total|sum|all|entire|complete|overall)\b/i,
  EQUIPMENT_UTILIZATION: /\b(equipment|utilization|excavator|dumper|machine)\b/i,
  
  // Advisory patterns
  ADVISORY: /\b(how to|how do|how can|how should|best practice|guideline|procedure|policy|safety|recommendation|improve|optimize|reduce|increase)\b/i,
  
  // Optimization patterns
  OPTIMIZATION: /\b(which excavator|which tipper|which combination|select equipment|choose equipment|should i pick|forecast|predict|prediction)\b/i,
  
  // SQL/Data patterns
  SQL_DATA: /\b(select|show|list|display|get|fetch|table|from|where|data|production|trips|tonnage|shift|equipment|row)\b/i,
  
  // Month patterns
  MONTH_NAMES: /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i,
  
  // Table extraction
  TABLE_NAME: /(?:in|from)\s+([a-zA-Z0-9_ ]+)/i,
} as const;

export const MONTH_MAP = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
} as const;

export function extractMonthNumber(query: string): number | null {
  const match = query.match(PATTERNS.MONTH_NAMES);
  if (!match) return null;
  
  const monthStr = match[1].toLowerCase();
  return MONTH_MAP[monthStr as keyof typeof MONTH_MAP] || null;
}

export const ALLOWED_TABLES = new Set([
  'production_summary',
  'trip_summary_by_date',
  'uploaded_files',
  'equipment',
]);
