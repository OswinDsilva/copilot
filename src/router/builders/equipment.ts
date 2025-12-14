/**
 * Equipment-related SQL builders
 * Handles equipment combinations, specific equipment queries, and equipment-based production
 */

import { getCurrentYear, buildShiftFilter } from '../helpers/dateUtils';
import { extractMonthNumber } from '../helpers/patterns';
import { COMBINATION_PATTERNS, METRIC_PATTERNS, QUERY_TYPE_PATTERNS, RANKING_PATTERNS } from '../helpers/keywords';
import { buildDateFilterFromParams, detectEquipmentType } from '../helpers/filterHelpers';

/**
 * Build SQL for equipment combination queries (tipper + excavator pairs)
 */
export function buildEquipmentCombinationSQL(params: Record<string, any>, question?: string): string | null {
  // Handle "which tippers/excavators" queries - single equipment type ranking
  if (question) {
    // Check for productivity/efficiency queries for combos
    const isProductivityCombo = COMBINATION_PATTERNS.PRODUCTIVITY.test(question) ||
                                COMBINATION_PATTERNS.PRODUCTIVITY_REVERSE.test(question);
    
    if (isProductivityCombo) {
      const monthNum = params.month || extractMonthNumber(question);
      const year = params.year || getCurrentYear();
      const limit = params.n || 10;
      
      let dateFilter = '';
      if (monthNum) {
        dateFilter = `WHERE EXTRACT(MONTH FROM trip_date) = ${monthNum} AND EXTRACT(YEAR FROM trip_date) = ${year}`;
      } else if (params.date) {
        dateFilter = `WHERE trip_date = '${params.date}'`;
      } else if (params.date_start && params.date_end) {
        dateFilter = `WHERE trip_date BETWEEN '${params.date_start}' AND '${params.date_end}'`;
      }
      
      // Productivity = total trips / number of days worked (trips per day)
      const whereClause = dateFilter || '';
      return `SELECT 
        tipper_id, 
        excavator, 
        SUM(trip_count) AS total_trips,
        COUNT(DISTINCT trip_date) AS days_worked,
        ROUND(SUM(trip_count) * 1.0 / COUNT(DISTINCT trip_date), 2) AS trips_per_day
      FROM trip_summary_by_date 
      ${whereClause}
      GROUP BY tipper_id, excavator 
      HAVING COUNT(DISTINCT trip_date) >= 2
      ORDER BY trips_per_day DESC 
      LIMIT ${limit}`;
    }
    
    const isTipperRanking = COMBINATION_PATTERNS.WHICH_TIPPERS.test(question);
    const isExcavatorRanking = COMBINATION_PATTERNS.WHICH_EXCAVATORS.test(question);
    
    if (isTipperRanking || isExcavatorRanking) {
      const groupColumn = isTipperRanking ? 'tipper_id' : 'excavator';
      const monthNum = params.month || extractMonthNumber(question);
      const year = params.year || getCurrentYear();
      const limit = params.n || 10;
      
      let dateFilter = '';
      if (monthNum) {
        dateFilter = `WHERE EXTRACT(MONTH FROM trip_date) = ${monthNum} AND EXTRACT(YEAR FROM trip_date) = ${year}`;
      } else if (params.date) {
        dateFilter = `WHERE trip_date = '${params.date}'`;
      } else if (params.date_start && params.date_end) {
        dateFilter = `WHERE trip_date BETWEEN '${params.date_start}' AND '${params.date_end}'`;
      }
      
      return `SELECT ${groupColumn}, SUM(trip_count) AS total_trips FROM trip_summary_by_date ${dateFilter} GROUP BY ${groupColumn} ORDER BY total_trips DESC LIMIT ${limit}`;
    }
  }
  
  // Handle both equipment combinations AND single equipment type queries (e.g., "which tippers")
  // CHANGE: Allow generic queries without specific machine IDs (e.g., "show all combinations")
  // Removed the check for params.machines/machine_types - we now handle all combination queries
  
  // CRITICAL: If query mentions actual "production" metrics, return null to let LLM handle it
  // Production queries need qty_ton and qty_m3, not just trip counts
  // BUT "productive" is okay - we handle it with trips per day
  if (question && /\b(production|tonnage|cubic|qty_ton|qty_m3|tons?|m3)\b/i.test(question) && 
      !/\bproductive\b/i.test(question)) {
    return null;
  }
  
  const limit = params.n || 10;
  let dateFilter = '';
  let shiftFilter = '';
  
  if (params.date) {
    dateFilter = `WHERE trip_date = '${params.date}'`;
  } else if (params.month) {
    const year = params.year || getCurrentYear();
    dateFilter = `WHERE EXTRACT(MONTH FROM trip_date) = ${params.month} AND EXTRACT(YEAR FROM trip_date) = ${year}`;
  } else if (params.date_start && params.date_end) {
    dateFilter = `WHERE trip_date BETWEEN '${params.date_start}' AND '${params.date_end}'`;
  }
  
  // Add shift filter if specified
  if (params.shift && params.shift.length > 0) {
    const shifts = params.shift.map((s: string) => `'${s}'`).join(', ');
    shiftFilter = dateFilter ? ` AND shift IN (${shifts})` : `WHERE shift IN (${shifts})`;
  }
  
  // Check if asking for "most trips" or similar superlatives (aggregate across all dates/shifts)
  const isMostTrips = question && RANKING_PATTERNS.MOST_TRIPS.test(question);
  
  if (isMostTrips) {
    // Aggregate total trips across all dates and shifts for each combo
    return `SELECT tipper_id, excavator, SUM(trip_count) AS total_trips FROM trip_summary_by_date ${dateFilter}${shiftFilter} GROUP BY tipper_id, excavator ORDER BY total_trips DESC LIMIT ${limit}`;
  }
  
  // Default: show detailed breakdown by shift and date
  return `SELECT tipper_id, excavator, shift, trip_date, SUM(trip_count) AS total_trips FROM trip_summary_by_date ${dateFilter}${shiftFilter} GROUP BY tipper_id, excavator, shift, trip_date ORDER BY total_trips DESC LIMIT ${limit}`;
}

/**
 * Build SQL for equipment-specific production queries (by equipment ID)
 */
export function buildEquipmentSpecificProductionSQL(params: Record<string, any>, query: string): string | null {
  const equipmentIds = params.equipment_ids;
  if (!equipmentIds || equipmentIds.length === 0) return null;
  
  // Detect equipment type from query or equipment ID pattern
  const { isTipper, isExcavator } = detectEquipmentType(query, equipmentIds);
  
  // Determine what metric is being requested
  const isTrips = METRIC_PATTERNS.TRIPS.test(query);
  const isTonnage = METRIC_PATTERNS.TONNAGE.test(query);
  const isWorkedWith = QUERY_TYPE_PATTERNS.WORKED_WITH.test(query);
  const isHowMany = QUERY_TYPE_PATTERNS.HOW_MANY.test(query);
  
  // CRITICAL: trip_summary_by_date uses trip_date column, NOT date
  // Build date filter manually with correct column name
  const { whereClause: baseDateFilter } = buildDateFilterFromParams(params, 'trip_date', query);
  
  // Add shift filtering if present
  const shiftFilter = buildShiftFilter(params, !!baseDateFilter);
  
  // Combine filters
  let whereClause = '';
  if (baseDateFilter) whereClause = baseDateFilter;
  if (shiftFilter) {
    whereClause = whereClause ? `${whereClause} ${shiftFilter}` : `WHERE ${shiftFilter.replace('AND ', '')}`;
  }
  
  // Handle tipper-specific queries
  if (isTipper) {
    const tipperFilter = equipmentIds.length === 1
      ? `tipper_id = '${equipmentIds[0]}'`
      : `tipper_id IN (${equipmentIds.map((id: string) => `'${id}'`).join(', ')})`;
    
    whereClause = whereClause 
      ? `${whereClause} AND ${tipperFilter}`
      : `WHERE ${tipperFilter}`;
    
    // "How many excavators did BB-53 work with"
    if (isHowMany && (isWorkedWith || /excavator/i.test(query))) {
      return `SELECT COUNT(DISTINCT excavator) AS count FROM trip_summary_by_date ${whereClause}`;
    }
    
    // "How many trips did BB-53 make"
    if (isTrips || isHowMany) {
      return `SELECT tipper_id, SUM(trip_count) AS total_trips, COUNT(DISTINCT trip_date) AS active_days FROM trip_summary_by_date ${whereClause} GROUP BY tipper_id`;
    }
    
    // Default: show details
    return `SELECT tipper_id, excavator, SUM(trip_count) AS total_trips FROM trip_summary_by_date ${whereClause} GROUP BY tipper_id, excavator ORDER BY total_trips DESC`;
  }
  
  // Handle excavator-specific queries
  if (isExcavator) {
    const excavatorFilter = equipmentIds.length === 1
      ? `excavator = '${equipmentIds[0]}'`
      : `excavator IN (${equipmentIds.map((id: string) => `'${id}'`).join(', ')})`;
    
    whereClause = whereClause 
      ? `${whereClause} AND ${excavatorFilter}`
      : `WHERE ${excavatorFilter}`;
    
    // "How many tippers has EX-141 worked with"
    if (isHowMany && (isWorkedWith || /tipper|dumper/i.test(query))) {
      return `SELECT COUNT(DISTINCT tipper_id) AS count FROM trip_summary_by_date ${whereClause}`;
    }
    
    // "How many trips did EX-141 make"
    if (isTrips || isHowMany) {
      return `SELECT excavator, SUM(trip_count) AS total_trips, COUNT(DISTINCT trip_date) AS active_days FROM trip_summary_by_date ${whereClause} GROUP BY excavator`;
    }
    
    // Default: show details
    return `SELECT excavator, tipper_id, SUM(trip_count) AS total_trips FROM trip_summary_by_date ${whereClause} GROUP BY excavator, tipper_id ORDER BY total_trips DESC`;
  }
  
  // Fallback: assume excavator for backward compatibility
  const equipmentFilter = equipmentIds.length === 1
    ? `WHERE excavator = '${equipmentIds[0]}'`
    : `WHERE excavator IN (${equipmentIds.map((id: string) => `'${id}'`).join(', ')})`;
  
  const baseDateFilterClean = baseDateFilter.replace('WHERE ', '');
  const combinedFilter = baseDateFilter 
    ? `${equipmentFilter} AND ${baseDateFilterClean}`
    : equipmentFilter;
  
  const finalFilter = shiftFilter 
    ? `${combinedFilter} ${shiftFilter}`
    : combinedFilter;
  
  // If asking for trips specifically, sum trip_count
  if (isTrips && !isTonnage) {
    return `SELECT 
      excavator,
      SUM(trip_count) AS total_trips,
      COUNT(DISTINCT trip_date) AS active_days
    FROM trip_summary_by_date
    ${finalFilter}
    GROUP BY excavator
    ORDER BY total_trips DESC`;
  }
  
  // For tonnage/production, we need to estimate or join
  // Since trip_summary_by_date doesn't have tonnage, we'll calculate estimated tonnage
  return `SELECT 
    excavator,
    SUM(trip_count) AS total_trips,
    ROUND(SUM(trip_count * 15.0), 2) AS estimated_tonnage,
    COUNT(DISTINCT trip_date) AS active_days,
    ROUND(AVG(trip_count), 2) AS avg_trips_per_day
  FROM trip_summary_by_date
  ${finalFilter}
  GROUP BY excavator
  ORDER BY total_trips DESC`;
}
