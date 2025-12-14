/**
 * Shift-related SQL builders
 * Handles shift aggregations, comparisons, and shift-specific queries
 */

import { buildDateFilter, buildShiftFilter } from '../helpers/dateUtils';
import { SHIFT_PATTERNS, AGGREGATION_PATTERNS } from '../helpers/keywords';

/**
 * Build SQL for shift aggregation/comparison queries
 */
export function buildShiftAggregationSQL(params: Record<string, any>, query: string): string | null {
  // Check if asking to compare shifts or aggregate by shift
  const isShiftComparison = SHIFT_PATTERNS.COMPARISON.test(query);
  
  // Check if asking for highest/lowest/best/worst shift (superlative queries)
  const isShiftSuperlative = SHIFT_PATTERNS.SUPERLATIVE.test(query);
  
  if (!isShiftComparison && !isShiftSuperlative) return null;
  
  const dateFilter = buildDateFilter(params);
  // For shift superlatives without date filter, aggregate across all available data
  if (!dateFilter && !isShiftSuperlative) return null;
  
  // Check what metrics are requested
  const wantsAverage = AGGREGATION_PATTERNS.AVERAGE.test(query);
  const wantsTotal = AGGREGATION_PATTERNS.TOTAL.test(query);
  const wantsTrips = /trips?/i.test(query);
  
  let selectClauses = ['shift'];
  let orderByColumn = 'total_tonnage';
  
  // Always include totals (for ordering), but label them appropriately
  if (wantsTotal || wantsAverage) {
    selectClauses.push('SUM(qty_ton) AS total_tonnage');
    if (wantsTrips) selectClauses.push('SUM(total_trips) AS total_trips');
  } else {
    // Default: just totals
    selectClauses.push('SUM(qty_ton) AS total_tonnage');
    if (wantsTrips) selectClauses.push('SUM(total_trips) AS total_trips');
  }
  
  if (wantsAverage) {
    selectClauses.push('AVG(qty_ton) AS avg_tonnage');
    if (wantsTrips) selectClauses.push('AVG(total_trips) AS avg_trips');
  }
  
  selectClauses.push('COUNT(DISTINCT date) AS production_days');
  
  // For superlative queries asking for "the shift" (singular), limit to 1
  const isSingularSuperlative = isShiftSuperlative && SHIFT_PATTERNS.SINGULAR.test(query);
  const limitClause = isSingularSuperlative ? ' LIMIT 1' : '';
  
  // Determine sort direction (DESC for highest/best/most, ASC for lowest/worst/least)
  const isAscending = /(lowest|worst|least|bottom)/i.test(query);
  const sortDirection = isAscending ? 'ASC' : 'DESC';
  
  return `SELECT ${selectClauses.join(', ')} FROM production_summary ${dateFilter ? dateFilter : ''} GROUP BY shift ORDER BY ${orderByColumn} ${sortDirection}${limitClause}`;
}

/**
 * Build SQL for shift-specific queries
 */
export function buildShiftSpecificSQL(params: Record<string, any>): string | null {
  if (!params.shift || params.shift.length === 0) return null;
  
  const dateFilter = buildDateFilter(params);
  const shiftFilter = buildShiftFilter(params, !!dateFilter);
  
  // production_summary columns: date, shift, qty_ton, qty_m3, target_ton, target_m3
  return `SELECT date, shift, qty_ton, qty_m3 FROM production_summary ${dateFilter} ${shiftFilter} ORDER BY date, shift`;
}
