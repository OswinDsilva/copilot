/**
 * Production and aggregation SQL builders
 * Handles generic production queries, date-based queries, trip counts, and routes/faces analysis
 */

import { buildDateFilter, buildShiftFilter, getCurrentYear } from '../helpers/dateUtils';
import { extractMonthNumber } from '../helpers/patterns';
import { AGGREGATION_PATTERNS } from '../helpers/keywords';

/**
 * Build generic SQL for date-based queries (fallback for specific dates)
 */
export function buildGenericDateQuery(params: Record<string, any>): string | null {
  const dateFilter = buildDateFilter(params);
  if (!dateFilter) return null;
  
  const shiftFilter = buildShiftFilter(params, true);
  // production_summary columns: date, shift, qty_ton, qty_m3, target_ton, target_m3
  return `SELECT date, shift, qty_ton, qty_m3 FROM production_summary ${dateFilter}${shiftFilter} ORDER BY date, shift`;
}

/**
 * Build SQL for date range aggregation queries
 */
export function buildDateRangeAggregationSQL(params: Record<string, any>): string | null {
  if (!params.date_range) return null;
  
  const dateFilter = buildDateFilter(params);
  const shiftFilter = buildShiftFilter(params, !!dateFilter);
  
  // production_summary columns: date, shift, qty_ton, qty_m3 (no total_trips column)
  return `SELECT date, shift, SUM(qty_ton) AS total_tonnage, SUM(qty_m3) AS total_cubic_meters FROM production_summary ${dateFilter}${shiftFilter} GROUP BY date, shift ORDER BY date DESC`;
}

/**
 * Build SQL for mining vs reclaim trip comparison queries
 */
export function buildMiningReclaimComparisonSQL(params: Record<string, any>, query: string): string | null {
  // Check for mining vs reclaim patterns
  const hasMining = /\b(mining|mine)\b/i.test(query);
  const hasReclaim = /\b(reclaim|reclai)\b/i.test(query);
  const hasTrips = /\b(trips|trip)\b/i.test(query);
  
  // Only match if both mining and reclaim are mentioned with trips
  if (!(hasMining && hasReclaim && hasTrips)) return null;
  
  // Determine grouping level based on query
  const hasPerDay = /\b(per day|daily|by date|each day)\b/i.test(query);
  const hasPerShift = /\b(per shift|by shift|each shift|shift-wise)\b/i.test(query);
  const hasPerMonth = /\b(per month|monthly|by month|each month)\b/i.test(query);
  
  const monthNum = params.month || extractMonthNumber(query);
  const year = params.year || getCurrentYear();
  
  // Build WHERE clause
  let whereClause = '';
  if (monthNum) {
    whereClause = ` WHERE EXTRACT(MONTH FROM date) = ${monthNum} AND EXTRACT(YEAR FROM date) = ${year}`;
  } else if (params.date_start && params.date_end) {
    whereClause = ` WHERE date BETWEEN '${params.date_start}' AND '${params.date_end}'`;
  } else if (params.date) {
    whereClause = ` WHERE date = '${params.date}'`;
  }
  
  // Per day comparison (most common)
  if (hasPerDay || (!hasPerShift && !hasPerMonth)) {
    return `SELECT date, SUM(trip_count_for_mining) AS mining_trips, SUM(trip_count_for_reclaim) AS reclaim_trips FROM production_summary${whereClause} GROUP BY date ORDER BY date`;
  }
  
  // Per shift comparison
  if (hasPerShift) {
    return `SELECT date, shift, SUM(trip_count_for_mining) AS mining_trips, SUM(trip_count_for_reclaim) AS reclaim_trips FROM production_summary${whereClause} GROUP BY date, shift ORDER BY date, shift`;
  }
  
  // Per month comparison
  if (hasPerMonth) {
    return `SELECT EXTRACT(MONTH FROM date) AS month, SUM(trip_count_for_mining) AS mining_trips, SUM(trip_count_for_reclaim) AS reclaim_trips FROM production_summary${whereClause} GROUP BY month ORDER BY month`;
  }
  
  return null;
}

/**
 * Build SQL for trip count aggregation queries
 */
export function buildTripCountAggregationSQL(params: Record<string, any>, query: string): string | null {
  // Check for total/sum queries with tonnage, m3, or trips
  const hasTotalTonnage = AGGREGATION_PATTERNS.TOTAL_TONNAGE.test(query);
  const hasTotalM3 = AGGREGATION_PATTERNS.TOTAL_M3.test(query);
  const hasTripKeyword = /\b(trip count|trips|trip_count|total trips)\b/i.test(query);
  
  // Handle total m3 queries
  if (hasTotalM3 && !hasTripKeyword) {
    const monthNum = params.month || extractMonthNumber(query);
    const year = params.year || getCurrentYear();
    
    // Build WHERE clause
    let whereConditions: string[] = [];
    
    if (monthNum) {
      whereConditions.push(`EXTRACT(MONTH FROM date) = ${monthNum}`);
      whereConditions.push(`EXTRACT(YEAR FROM date) = ${year}`);
    }
    
    // Add shift filter if present
    if (params.shift && params.shift.length > 0) {
      const shifts = params.shift.map((s: string) => `'${s}'`).join(', ');
      whereConditions.push(`shift IN (${shifts})`);
    }
    
    if (whereConditions.length > 0) {
      return `SELECT SUM(qty_m3) AS total_m3 FROM production_summary WHERE ${whereConditions.join(' AND ')}`;
    }
  }
  
  // Handle total tonnage queries
  if (hasTotalTonnage && !hasTripKeyword) {
    const monthNum = params.month || extractMonthNumber(query);
    const year = params.year || getCurrentYear();
    
    // Build WHERE clause
    let whereConditions: string[] = [];
    
    if (monthNum) {
      whereConditions.push(`EXTRACT(MONTH FROM date) = ${monthNum}`);
      whereConditions.push(`EXTRACT(YEAR FROM date) = ${year}`);
    }
    
    // Add shift filter if present
    if (params.shift && params.shift.length > 0) {
      const shifts = params.shift.map((s: string) => `'${s}'`).join(', ');
      whereConditions.push(`shift IN (${shifts})`);
    }
    
    if (whereConditions.length > 0) {
      return `SELECT SUM(qty_ton) AS total_tonnage FROM production_summary WHERE ${whereConditions.join(' AND ')}`;
    }
  }
  
  // Handle trip count queries
  if (!hasTripKeyword) return null;
  
  const monthNum = params.month || extractMonthNumber(query);
  const year = params.year || getCurrentYear();
  
  // If month specified, aggregate for that month
  if (monthNum) {
    return `SELECT SUM(trip_count) FROM trip_summary_by_date WHERE EXTRACT(MONTH FROM trip_date) = ${monthNum} AND EXTRACT(YEAR FROM trip_date) = ${year}`;
  }
  
  // If date range specified
  if (params.date_start && params.date_end) {
    return `SELECT SUM(trip_count) FROM trip_summary_by_date WHERE trip_date >= '${params.date_start}' AND trip_date <= '${params.date_end}'`;
  }
  
  // If specific date
  if (params.date) {
    return `SELECT SUM(trip_count) FROM trip_summary_by_date WHERE trip_date = '${params.date}'`;
  }
  
  return null;
}

/**
 * Build SQL for routes/faces analysis queries
 */
export function buildRoutesFacesAnalysisSQL(params: Record<string, any>, query: string): string | null {
  const monthNum = params.month || extractMonthNumber(query);
  const year = params.year || getCurrentYear();
  const limit = params.n || 20;
  
  let dateFilter = '';
  if (monthNum) {
    dateFilter = `WHERE EXTRACT(MONTH FROM trip_date) = ${monthNum} AND EXTRACT(YEAR FROM trip_date) = ${year}`;
  } else if (params.date) {
    dateFilter = `WHERE trip_date = '${params.date}'`;
  } else if (params.date_start && params.date_end) {
    dateFilter = `WHERE trip_date BETWEEN '${params.date_start}' AND '${params.date_end}'`;
  }
  
  // Order by total_trips (actual trip count) not usage_count (date+shift combinations)
  return `SELECT route_or_face, SUM(trip_count) AS total_trips FROM trip_summary_by_date ${dateFilter} GROUP BY route_or_face ORDER BY total_trips DESC LIMIT ${limit}`;
}

/**
 * Build SQL for heatmap visualizations (requires 2 categorical dimensions)
 */
export function buildHeatmapSQL(params: Record<string, any>, query: string): string | null {
  // Only trigger for explicit heatmap requests
  const isHeatmap = /\bheat\s*map\b/i.test(query);
  if (!isHeatmap) return null;
  
  // Heatmaps need 2 categorical dimensions + 1 numeric value
  // Common patterns: month x shift, equipment x shift, route x shift, month x equipment
  
  // Check what dimensions are mentioned
  const hasMonth = /\bmonths?\b/i.test(query);
  const hasShift = /\bshifts?\b/i.test(query);
  const hasEquipment = /\b(tipper|excavator|equipment|vehicle)\b/i.test(query);
  const hasRoute = /\b(route|face)\b/i.test(query);
  
  // Default to month x shift if only month mentioned (most common case)
  let dimension1 = 'month';
  let dimension2 = 'shift';
  
  if (hasMonth && hasShift) {
    dimension1 = 'month';
    dimension2 = 'shift';
  } else if (hasMonth && hasEquipment) {
    dimension1 = 'month';
    dimension2 = 'equipment';
  } else if (hasShift && hasEquipment) {
    dimension1 = 'shift';
    dimension2 = 'equipment';
  } else if (hasRoute && hasShift) {
    dimension1 = 'route';
    dimension2 = 'shift';
  } else if (hasMonth) {
    // Only month mentioned - default to month x shift
    dimension1 = 'month';
    dimension2 = 'shift';
  }
  
  const year = params.year || getCurrentYear();
  
  // Build SQL based on dimensions
  if (dimension1 === 'month' && dimension2 === 'shift') {
    // Month x Shift heatmap from production_summary
    return `SELECT EXTRACT(MONTH FROM date), CASE EXTRACT(MONTH FROM date) WHEN 1 THEN 'January' WHEN 2 THEN 'February' WHEN 3 THEN 'March' WHEN 4 THEN 'April' WHEN 5 THEN 'May' WHEN 6 THEN 'June' WHEN 7 THEN 'July' WHEN 8 THEN 'August' WHEN 9 THEN 'September' WHEN 10 THEN 'October' WHEN 11 THEN 'November' WHEN 12 THEN 'December' END, shift, SUM(qty_ton) FROM production_summary WHERE EXTRACT(YEAR FROM date) = ${year} GROUP BY 1, 2, 3 ORDER BY 1, 3`;
  } else if (dimension1 === 'shift' && dimension2 === 'equipment') {
    // Shift x Equipment heatmap from trip_summary_by_date
    return `SELECT shift, tipper_id, SUM(qty_ton) FROM trip_summary_by_date WHERE EXTRACT(YEAR FROM trip_date) = ${year} GROUP BY 1, 2 ORDER BY shift, tipper_id`;
  } else if (dimension1 === 'route' && dimension2 === 'shift') {
    // Route x Shift heatmap from trip_summary_by_date
    return `SELECT route_or_face, shift, SUM(trip_count) FROM trip_summary_by_date WHERE EXTRACT(YEAR FROM trip_date) = ${year} GROUP BY 1, 2 ORDER BY route_or_face, shift`;
  }
  
  // Default fallback - month x shift
  return `SELECT EXTRACT(MONTH FROM date), CASE EXTRACT(MONTH FROM date) WHEN 1 THEN 'January' WHEN 2 THEN 'February' WHEN 3 THEN 'March' WHEN 4 THEN 'April' WHEN 5 THEN 'May' WHEN 6 THEN 'June' WHEN 7 THEN 'July' WHEN 8 THEN 'August' WHEN 9 THEN 'September' WHEN 10 THEN 'October' WHEN 11 THEN 'November' WHEN 12 THEN 'December' END, shift, SUM(qty_ton) FROM production_summary WHERE EXTRACT(YEAR FROM date) = ${year} GROUP BY 1, 2, 3 ORDER BY 1, 3`;
}
