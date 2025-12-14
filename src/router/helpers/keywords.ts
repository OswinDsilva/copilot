/**
 * Centralized keyword and regex patterns for SQL builders
 * Used across all builder functions to avoid duplicating regex literals
 */

// Metric detection patterns
export const METRIC_PATTERNS = {
  TRIPS: /\b(trips?|trip count)\b/i,
  TONNAGE: /\b(tonnage|tons?|production)\b/i,
  VOLUME: /m3|cubic\s*meters?|volume/i,
  PRODUCTIVITY: /\b(productive|productivity|efficiency|efficient)\b/i,
};

// Ranking/comparison patterns
export const RANKING_PATTERNS = {
  TOP: /top|highest|best|maximum|max/i,
  BOTTOM: /bottom|lowest|worst|minimum|min|least/i,
  SUPERLATIVE: /\b(highest|most|best|lowest|least|worst|maximum|minimum|max|min|top|bottom|higest|lowst)\b/i,
  MOST_TRIPS: /(most|highest|top|best|maximum).*trips?|(trips?).*\b(most|highest|top|best|maximum)\b/i,
};

// Equipment patterns
export const EQUIPMENT_PATTERNS = {
  TIPPER: /\b(tipper|dumper|BB-\d+|DT-\d+)\b/i,
  TIPPER_RANKING: /\b(tipper|dumper).*\b(most|highest|maximum|max)\s+trips/i,
  TIPPER_TONNAGE_RANKING: /\b(tipper|dumper).*\b(most|highest|maximum|max|top|total)\s+(tonnage|ton|production|qty)/i,
  TIPPER_GROUPING: /\btrips?\s+by\s+(tipper|dumper)/i,
  
  EXCAVATOR: /\bexcavator/i,
  EXCAVATOR_RANKING: /\bexcavator.*\b(most|highest|maximum|max)\s+trips/i,
  EXCAVATOR_TONNAGE_RANKING: /\bexcavator.*\b(most|highest|maximum|max|top|total)\s+(tonnage|ton|production|qty)/i,
  EXCAVATOR_GROUPING: /\btrips?\s+by\s+excavator/i,
  
  TIPPER_ID_PREFIX: /^(BB-|DT-)/i,
  EXCAVATOR_ID_PREFIX: /^EX-/i,
  
  TOP_N_BY_METRIC: /\btop\s+\d+\s+(excavators?|tippers?|dumpers?)\s+by\s+(tonnage|ton|production|qty|trips)/i,
};

// Shift patterns
export const SHIFT_PATTERNS = {
  COMPARISON: /compare.*shift|by\s+shift|shift\s+comparison|per\s+shift/i,
  SUPERLATIVE: /(highest|lowest|best|worst|most|least|top|bottom).*shift|shift.*(highest|lowest|best|worst|most|least)/i,
  SINGULAR: /\b(the|which)\s+shift\b/i,
};

// Date/time patterns
export const DATE_PATTERNS = {
  ORDERING: /\b(order|sort|rank|arrange).*\b(by|descending|ascending|desc|asc)\b/i,
  DESCENDING: /\b(descending|ascending|desc|asc)\b/i,
  BY_MONTH: /\bby\s+months?\b/i,
  MONTH_REFERENCE: /\b(which|what|select|show|find|get|all|chart|graph).*\bmonths?\b/i,
  MONTH_WITH: /\bmonths?\b.*(with|had|has|by)/i,
  ALL_MONTHS: /\ball\s+months?\b/i,
};

// Aggregation patterns
export const AGGREGATION_PATTERNS = {
  AVERAGE: /average|avg|mean/i,
  TOTAL: /total|sum/i,
  TOTAL_TONNAGE: /\b(total|sum).*\b(tonnage|qty_ton|tons?)\b/i,
  TOTAL_M3: /\b(total|sum).*\b(m3|cubic\s*meters?|qty_m3)\b/i,
};

// Query type patterns
export const QUERY_TYPE_PATTERNS = {
  HOW_MANY: /\bhow many\b/i,
  WHICH_DATE: /\b(which|what)\s+(date|day)\b/i,
  WORKED_WITH: /\b(worked with|partnered with|paired with)\b/i,
};

// Visualization patterns
export const VISUALIZATION_PATTERNS = {
  CHART: /\b(chart|graph|plot|pie)\b/i,
  HEATMAP: /\bheat\s*map\b/i,
  VISUALIZE: /\b(chart|graph|plot|visuali[sz]e)\b/i,
};

// Combination patterns
export const COMBINATION_PATTERNS = {
  PRODUCTIVITY: /(most|highest|best)\s+(productive|efficient|effective).*\b(combo|combination|pair)/i,
  PRODUCTIVITY_REVERSE: /\b(combo|combination|pair).*\b(most|highest|best)\s+(productive|efficient|effective)/i,
  WHICH_TIPPERS: /which\s+(tippers?|dumpers?)\s+(made|had|did).*most\s+trips/i,
  WHICH_EXCAVATORS: /which\s+excavators?\s+(made|had|did).*most\s+trips/i,
};

// Table/column reference patterns
export const COLUMN_PATTERNS = {
  SHIFT_MENTION: /\bshift/i,
};

/**
 * Helper function to check if query is asking for lowest/minimum/worst
 */
export function isLowestQuery(query: string): boolean {
  return /\b(lowest|least|worst|minimum|min|bottom|ascending|asc)\b/i.test(query);
}

/**
 * Helper function to check if query is asking for highest/maximum/best
 */
export function isHighestQuery(query: string): boolean {
  return /\b(highest|most|best|maximum|max|top|descending|desc)\b/i.test(query);
}

/**
 * Helper function to extract limit from "top N" or "N items" patterns
 */
export function extractLimit(query: string, defaultLimit: number = 10): number {
  const topMatch = query.match(/\btop\s+(\d+)/i);
  if (topMatch) return parseInt(topMatch[1]);
  
  const limitMatch = query.match(/\b(\d+)\s+months?\b/i);
  if (limitMatch) return parseInt(limitMatch[1]);
  
  return defaultLimit;
}
