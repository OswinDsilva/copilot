/**
 * Ranking SQL builders
 * Handles equipment ranking, ordinal row queries, and top/bottom queries
 */

import { getCurrentYear, buildDateFilter } from '../helpers/dateUtils';
import { extractMonthNumber, PATTERNS, ALLOWED_TABLES } from '../helpers/patterns';
import { EQUIPMENT_PATTERNS, RANKING_PATTERNS, VISUALIZATION_PATTERNS, extractLimit } from '../helpers/keywords';

/**
 * Build SQL for efficiency/ratio queries (tons per trip, productivity ratios)
 */
export function buildEfficiencyRatioSQL(params: Record<string, any>, query: string): string | null {
  // Check for efficiency/ratio patterns
  const isEfficiency = /\b(efficiency|ratio|per\s*trip|productivity|tons?\s*per\s*trip|tonnes?\s*per\s*trip)\b/i.test(query);
  if (!isEfficiency) return null;
  
  const isHighest = /\b(highest|most|best|maximum|max|top)\b/i.test(query);
  const isLowest = /\b(lowest|least|worst|minimum|min|bottom)\b/i.test(query);
  
  if (!isHighest && !isLowest) return null;
  
  const orderDir = isLowest ? 'ASC' : 'DESC';
  const limit = extractLimit(query, 1);
  
  // Build date filter if present
  const monthNum = params.month || extractMonthNumber(query);
  const year = params.year || getCurrentYear();
  
  let dateFilter = 'WHERE total_trips > 0';
  
  if (monthNum) {
    dateFilter = `WHERE total_trips > 0 AND EXTRACT(MONTH FROM date) = ${monthNum} AND EXTRACT(YEAR FROM date) = ${year}`;
  } else if (params.date) {
    dateFilter = `WHERE total_trips > 0 AND date = '${params.date}'`;
  } else if (params.date_start && params.date_end) {
    dateFilter = `WHERE total_trips > 0 AND date BETWEEN '${params.date_start}' AND '${params.date_end}'`;
  } else if (params.quarter) {
    const quarterStart = (params.quarter - 1) * 3 + 1;
    const quarterEnd = params.quarter * 3;
    dateFilter = `WHERE total_trips > 0 AND EXTRACT(MONTH FROM date) BETWEEN ${quarterStart} AND ${quarterEnd} AND EXTRACT(YEAR FROM date) = ${year}`;
  }
  
  // Build efficiency calculation SQL
  return `SELECT date, shift, qty_ton, total_trips, (qty_ton * 1.0 / NULLIF(total_trips, 0)) AS tons_per_trip_efficiency
FROM production_summary
${dateFilter}
ORDER BY tons_per_trip_efficiency ${orderDir}
LIMIT ${limit}`;
}

/**
 * Build SQL for equipment ranking queries (tipper/excavator with most trips/tonnage/production)
 * 
 * NOTE: trip_summary_by_date has equipment IDs but NO tonnage column (only trip_count)
 *       production_summary has tonnage but NO equipment IDs (only counts)
 *       For tonnage queries, we can only give aggregate data, not per-equipment
 */
export function buildEquipmentRankingSQL(params: Record<string, any>, query: string): string | null {
  // Match ranking patterns for trips
  const isTipperRanking = EQUIPMENT_PATTERNS.TIPPER_RANKING.test(query);
  const isExcavatorRanking = EQUIPMENT_PATTERNS.EXCAVATOR_RANKING.test(query);
  
  // Match ranking patterns for tonnage/production
  const isTipperTonnageRanking = EQUIPMENT_PATTERNS.TIPPER_TONNAGE_RANKING.test(query);
  const isExcavatorTonnageRanking = EQUIPMENT_PATTERNS.EXCAVATOR_TONNAGE_RANKING.test(query);
  
  // Match "top N excavators/tippers by tonnage/production"
  const isTopExcavatorsByMetric = EQUIPMENT_PATTERNS.TOP_N_BY_METRIC.test(query) && /excavator/i.test(query);
  const isTopTippersByMetric = EQUIPMENT_PATTERNS.TOP_N_BY_METRIC.test(query) && /(tipper|dumper)/i.test(query);
  
  // Match grouping patterns (by tipper, by excavator)
  const isTipperGrouping = EQUIPMENT_PATTERNS.TIPPER_GROUPING.test(query) || /\b(tipper|dumper).*\btrips?\b/i.test(query);
  const isExcavatorGrouping = EQUIPMENT_PATTERNS.EXCAVATOR_GROUPING.test(query) || /\bexcavator.*\btrips?\b/i.test(query);
  
  if (!isTipperRanking && !isExcavatorRanking && !isTipperTonnageRanking && !isExcavatorTonnageRanking 
      && !isTopExcavatorsByMetric && !isTopTippersByMetric && !isTipperGrouping && !isExcavatorGrouping) {
    return null;
  }
  
  // Determine which equipment type
  const isTipperQuery = isTipperRanking || isTipperTonnageRanking || isTopTippersByMetric || isTipperGrouping;
  const groupColumn = isTipperQuery ? 'tipper_id' : 'excavator';
  
  // Determine which metric (tonnage vs trips)
  // CRITICAL: trip_summary_by_date doesn't have qty_ton, only trip_count
  const isTonnageQuery = isTipperTonnageRanking || isExcavatorTonnageRanking || isTopExcavatorsByMetric || isTopTippersByMetric;
  
  // For tonnage queries, we can't use trip_summary_by_date - return null to fall back to LLM
  // which will explain the limitation or use production_summary for aggregate data
  if (isTonnageQuery) {
    return null;
  }
  
  const metricColumn = 'trip_count';
  const metricAlias = 'total_trips';
  
  const monthNum = params.month || extractMonthNumber(query);
  const year = params.year || getCurrentYear();
  
  // Check if asking for single top result or multiple (for charts, return all)
  const isChart = VISUALIZATION_PATTERNS.CHART.test(query);
  
  const limit = isChart ? 20 : extractLimit(query, /\bthe\s+(tipper|excavator)\b/i.test(query) ? 1 : 10);
  
  let dateFilter = '';
  if (monthNum) {
    dateFilter = `WHERE EXTRACT(MONTH FROM trip_date) = ${monthNum} AND EXTRACT(YEAR FROM trip_date) = ${year}`;
  } else if (params.date) {
    dateFilter = `WHERE trip_date = '${params.date}'`;
  } else if (params.date_start && params.date_end) {
    dateFilter = `WHERE trip_date BETWEEN '${params.date_start}' AND '${params.date_end}'`;
  } else if (params.quarter) {
    // Handle quarter filtering (Q1 = months 1-3, Q2 = 4-6, Q3 = 7-9, Q4 = 10-12)
    const quarterStart = (params.quarter - 1) * 3 + 1;
    const quarterEnd = params.quarter * 3;
    dateFilter = `WHERE EXTRACT(MONTH FROM trip_date) BETWEEN ${quarterStart} AND ${quarterEnd} AND EXTRACT(YEAR FROM trip_date) = ${year}`;
  }
  
  return `SELECT ${groupColumn}, SUM(${metricColumn}) AS ${metricAlias} FROM trip_summary_by_date ${dateFilter} GROUP BY ${groupColumn} ORDER BY ${metricAlias} DESC LIMIT ${limit}`;
}

/**
 * Build SQL for ordinal row queries (e.g., "select 19th row")
 */
export function buildOrdinalRowSQL(params: Record<string, any>, query: string): string | null {
  // Delegate equipment ranking to dedicated function
  const equipmentRankSQL = buildEquipmentRankingSQL(params, query);
  if (equipmentRankSQL) return equipmentRankSQL;
  
  if (!params.row_number) return null;
  
  const rawTable = query.match(PATTERNS.TABLE_NAME)?.[1]?.trim() || '';
  const normalized = rawTable ? rawTable.toLowerCase().replace(/[^a-z0-9]+/g, '_') : '';
  
  if (!normalized || !ALLOWED_TABLES.has(normalized)) return null;
  
  const offset = Math.max(0, params.row_number - 1);
  // Use appropriate sort column for each table (with quotes for case-sensitive columns)
  const sortColumn = normalized === 'trip_summary_by_date' ? 'trip_date' : 
                    normalized === 'production_summary' ? '"date"' : 
                    'id';
  return `SELECT * FROM ${normalized} ORDER BY ${sortColumn} ASC LIMIT 1 OFFSET ${offset}`;
}

/**
 * Build SQL for top/bottom N shifts queries
 */
export function buildTopBottomShiftsSQL(params: Record<string, any>): string | null {
  if (!params.rank_type || !params.n) return null;
  
  const isBottom = params.rank_type === 'bottom';
  const orderDir = isBottom ? 'ASC' : 'DESC';
  const limit = params.n || 10;
  
  const dateFilter = buildDateFilter(params);
  
  return `SELECT date, shift, qty_ton, total_trips FROM production_summary ${dateFilter} ORDER BY qty_ton ${orderDir} LIMIT ${limit}`;
}

/**
 * Build SQL for top/bottom production days in a time period
 */
export function buildTopProductionDaysSQL(params: Record<string, any>, query: string): string | null {
  // Check if asking for top/bottom/highest/lowest production days or dates
  const isTopBottom = RANKING_PATTERNS.SUPERLATIVE.test(query);
  if (!isTopBottom) return null;
  
  const isBottom = RANKING_PATTERNS.BOTTOM.test(query);
  const limit = params.n || 5;
  
  const dateFilter = buildDateFilter(params);
  if (!dateFilter) return null;
  
  // Check if asking for specific columns or metrics
  const wantsM3 = /m3|cubic\s*meters?|volume/i.test(query);
  const wantsTrips = /trips?/i.test(query);
  const wantsDate = /\b(which|what)\s+(date|day)\b/i.test(query);
  
  // If asking for trips specifically, use trip_summary_by_date table
  if (wantsTrips) {
    const orderDir = isBottom ? 'ASC' : 'DESC';
    const dateCol = 'trip_date';
    const tripFilter = dateFilter.replace(/\bdate\b/g, dateCol);
    
    // Aggregate trips by date
    return `SELECT ${dateCol} AS date, SUM(trip_count) AS total_trips 
FROM trip_summary_by_date 
${tripFilter} 
GROUP BY ${dateCol} 
ORDER BY total_trips ${orderDir} 
LIMIT ${wantsDate ? 1 : limit}`;
  }
  
  // For tonnage/volume queries
  let columns = 'date, qty_ton';
  if (wantsM3) columns += ', qty_m3';
  
  const orderDir = isBottom ? 'ASC' : 'DESC';
  const orderByCol = wantsM3 ? 'qty_m3' : 'qty_ton';
  
  return `SELECT ${columns} FROM production_summary ${dateFilter} ORDER BY ${orderByCol} ${orderDir} LIMIT ${wantsDate ? 1 : limit}`;
}
