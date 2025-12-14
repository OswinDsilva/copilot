/**
 * Monthly summary SQL builders
 * Handles month-based aggregations, summaries, and comparisons
 */

import { getCurrentYear, buildShiftFilter } from '../helpers/dateUtils';
import { extractMonthNumber } from '../helpers/patterns';
import { DATE_PATTERNS, extractLimit } from '../helpers/keywords';
import { getSortDirection } from '../helpers/dateFilters';
import { TABLES, monthNumberToName } from '../helpers/joinRules';

/**
 * Build SQL for monthly summary queries
 */
export function buildMonthlySummarySQL(params: Record<string, any>, query: string): string | null {
  const monthNum = params.month || extractMonthNumber(query);
  if (!monthNum) return null;
  
  // Don't generate monthly summary if it's a specific date query (has both month AND date)
  if (params.date && params.parsed_date?.type === 'single') return null;
  
  // Don't generate monthly summary if it's a top/bottom query
  const isTopBottom = /top|highest|best|bottom|lowest|worst/i.test(query);
  if (isTopBottom) return null;
  
  // Don't generate monthly summary if it's a shift comparison
  const isShiftComparison = /compare.*shift|by\s+shift|shift\s+comparison|per\s+shift/i.test(query);
  if (isShiftComparison) return null;
  
  const year = params.year || getCurrentYear();
  const shiftFilter = buildShiftFilter(params, true);
  
  // Check if user asks for trips or equipment utilization
  const needsTrips = /\b(trip|trips|trip[_ ]count)\b/i.test(query);
  const needsEquipment = /\b(equipment|utilization|excavator|tipper|dumper|machine|vehicle)\b/i.test(query);
  
  // If user asks for trips or equipment, need subqueries (NOT JOIN to avoid duplication)
  if (needsTrips || needsEquipment) {
    // Use column aliases with AS for cleaner output
    let sql = `SELECT 
    (SELECT SUM(qty_ton) FROM production_summary WHERE EXTRACT(MONTH FROM date) = ${monthNum} AND EXTRACT(YEAR FROM date) = ${year}${shiftFilter}) AS total_tonnage,
    (SELECT SUM(qty_m3) FROM production_summary WHERE EXTRACT(MONTH FROM date) = ${monthNum} AND EXTRACT(YEAR FROM date) = ${year}${shiftFilter}) AS total_cubic_meters,
    (SELECT COUNT(DISTINCT date) FROM production_summary WHERE EXTRACT(MONTH FROM date) = ${monthNum} AND EXTRACT(YEAR FROM date) = ${year}${shiftFilter}) AS production_days`;
    
    if (needsTrips) {
      sql += `,\n    (SELECT SUM(trip_count) FROM trip_summary_by_date WHERE EXTRACT(MONTH FROM trip_date) = ${monthNum} AND EXTRACT(YEAR FROM trip_date) = ${year}${shiftFilter.replace(/date/g, 'trip_date')}) AS total_trips`;
    }
    
    if (needsEquipment) {
      sql += `,\n    (SELECT COUNT(DISTINCT tipper_id) FROM trip_summary_by_date WHERE EXTRACT(MONTH FROM trip_date) = ${monthNum} AND EXTRACT(YEAR FROM trip_date) = ${year}${shiftFilter.replace(/date/g, 'trip_date')}) AS unique_tippers,\n    (SELECT COUNT(DISTINCT excavator) FROM trip_summary_by_date WHERE EXTRACT(MONTH FROM trip_date) = ${monthNum} AND EXTRACT(YEAR FROM trip_date) = ${year}${shiftFilter.replace(/date/g, 'trip_date')}) AS unique_excavators`;
    }
    
    return sql;
  }
  
  // Simple production summary without trips/equipment
  return `SELECT 
    SUM(qty_ton) AS total_tonnage,
    SUM(qty_m3) AS total_cubic_meters,
    AVG(qty_ton) AS avg_daily_tonnage,
    MAX(qty_ton) AS max_daily_tonnage,
    MIN(qty_ton) AS min_daily_tonnage,
    COUNT(DISTINCT date) AS production_days
  FROM production_summary
  WHERE EXTRACT(MONTH FROM date) = ${monthNum} AND EXTRACT(YEAR FROM date) = ${year}${shiftFilter}`;
}

/**
 * Build SQL for aggregation summary queries (monthly totals with equipment)
 */
export function buildAggregationSummarySQL(params: Record<string, any>, query: string): string | null {
  const monthNum = params.month || extractMonthNumber(query);
  if (!monthNum) return null;
  
  const year = getCurrentYear();
  
  // production_summary columns: date, shift, qty_ton, qty_m3, target_ton, target_m3 (no total_trips, excavator, dumper)
  let sql = `SELECT 
    SUM(qty_ton) AS total_tonnage,
    SUM(qty_m3) AS total_cubic_meters,
    AVG(qty_ton) AS avg_daily_tonnage,
    COUNT(DISTINCT date) AS production_days`;
  
  // Note: equipment utilization data not available in production_summary
  // Equipment data is in trip_summary_by_date (tipper_id, excavator)
  
  sql += `
  FROM production_summary
  WHERE EXTRACT(MONTH FROM date) = ${monthNum} AND EXTRACT(YEAR FROM date) = ${year}`;
  
  return sql;
}

/**
 * Build SQL for month comparison queries (e.g., "which month had the highest production")
 */
export function buildMonthComparisonSQL(params: Record<string, any>, query: string): string | null {
  // Trigger for queries asking about months with superlatives OR ordering OR "by month"
  const hasMonthReference = DATE_PATTERNS.MONTH_REFERENCE.test(query) || 
                            DATE_PATTERNS.MONTH_WITH.test(query) ||
                            DATE_PATTERNS.BY_MONTH.test(query);
  const hasSuperlative = /\b(highest|most|best|lowest|least|worst|maximum|minimum|max|min|top|bottom|higest|lowst)\b/i.test(query);
  const hasOrdering = DATE_PATTERNS.ORDERING.test(query) || DATE_PATTERNS.DESCENDING.test(query);
  const hasByMonth = DATE_PATTERNS.BY_MONTH.test(query);
  
  const isMonthComparison = hasMonthReference && (hasSuperlative || hasOrdering || hasByMonth);
  
  if (!isMonthComparison) return null;
  
  // Determine metric - check for trip count queries
  const hasTripCount = /\b(trip count|trips|trip_count|total trips|number of trips)\b/i.test(query);
  const metric = hasTripCount ? 'trip_count' : 'qty_ton';
  
  // Select table based on metric
  // trip_count is in trip_summary_by_date, qty_ton is in production_summary
  const table = hasTripCount ? TABLES.TRIPS : TABLES.PRODUCTION;
  const dateColumn = hasTripCount ? 'trip_date' : 'date';
  
  // Determine ordering (DESC for highest/most/best/max/descending, ASC for lowest/least/worst/min/ascending)
  const order = getSortDirection(query);
  
  // Determine limit (default to all months for charts, otherwise 1 for specific comparisons)
  const hasAll = DATE_PATTERNS.ALL_MONTHS.test(query);
  const isChart = /\b(chart|graph|plot|visuali[sz]e)\b/i.test(query);
  const limit = hasAll || isChart ? 12 : extractLimit(query, 1);
  
  // Year filter (default to current year if not specified)
  const year = params.year || getCurrentYear();
  
  // For charts, order chronologically (by month number)
  // For comparisons (highest/lowest), order by value (sum)
  const orderByClause = isChart ? 'ORDER BY 1' : `ORDER BY 3 ${order}`;
  
  // Use CASE to convert month number to name (avoid TO_CHAR which triggers AS errors)
  return `SELECT EXTRACT(MONTH FROM ${dateColumn}), ${monthNumberToName(`EXTRACT(MONTH FROM ${dateColumn})`)}, SUM(${metric}) FROM ${table} WHERE EXTRACT(YEAR FROM ${dateColumn}) = ${year} GROUP BY 1 ${orderByClause} LIMIT ${limit}`;
}
