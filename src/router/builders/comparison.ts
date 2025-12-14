/**
 * Comparison SQL builders
 * Handles queries comparing two entities (months, shifts, equipment, dates)
 */

import { getCurrentYear } from '../helpers/dateUtils';
import { extractMonthNumber } from '../helpers/patterns';
import { METRIC_PATTERNS } from '../helpers/keywords';
import { TABLES } from '../helpers/joinRules';

/**
 * Build SQL for comparison queries (comparing two entities)
 * Examples:
 * - "Did may have higher production or january"
 * - "Did BB-53 make higher trips today or BB-43"
 * - "Is shift A more productive or shift B"
 */
export function buildComparisonSQL(params: Record<string, any>, query: string): string | null {
  if (!params.comparison) return null;
  
  const { entity1, entity2 } = params.comparison;
  const comparisonType = params.comparison_type;
  
  // Determine metric being compared
  const isTrips = METRIC_PATTERNS.TRIPS.test(query);
  const isProductivity = METRIC_PATTERNS.PRODUCTIVITY.test(query);
  
  // Default metric
  let metricColumn = 'qty_ton';
  let metricAlias = 'total_tonnage';
  let table: string = TABLES.PRODUCTION;
  let dateColumn = 'date';
  
  if (isTrips) {
    metricColumn = 'trip_count';
    metricAlias = 'total_trips';
    table = TABLES.TRIPS;
    dateColumn = 'trip_date';
  } else if (isProductivity) {
    // Productivity = trips per day
    metricColumn = 'trip_count';
    metricAlias = 'trips_per_day';
    table = TABLES.TRIPS;
    dateColumn = 'trip_date';
  }
  
  const year = params.year || getCurrentYear();
  
  // Build SQL based on comparison type
  if (comparisonType === 'month') {
    return buildMonthComparisonQuery(
      entity1, entity2, year, dateColumn, table, metricColumn, metricAlias, isProductivity
    );
  }
  
  if (comparisonType === 'shift') {
    return buildShiftComparisonQuery(
      entity1, entity2, params, year, dateColumn, table, metricColumn, metricAlias, isProductivity
    );
  }
  
  if (comparisonType === 'equipment') {
    return buildEquipmentComparisonQuery(
      entity1, entity2, params, year, isProductivity
    );
  }
  
  if (comparisonType === 'date') {
    return buildDateComparisonQuery(
      entity1, entity2, dateColumn, table, metricColumn, metricAlias
    );
  }
  
  // Fallback: return null to let LLM handle it
  return null;
}

/**
 * Build month comparison query
 */
function buildMonthComparisonQuery(
  entity1: string,
  entity2: string,
  year: number,
  dateColumn: string,
  table: string,
  metricColumn: string,
  metricAlias: string,
  isProductivity: boolean
): string | null {
  const month1 = extractMonthNumber(entity1);
  const month2 = extractMonthNumber(entity2);
  
  if (!month1 || !month2) return null;
  
  if (isProductivity) {
    // Calculate trips per day for each month
    return `SELECT 
      CASE EXTRACT(MONTH FROM ${dateColumn})
        WHEN ${month1} THEN '${entity1}'
        WHEN ${month2} THEN '${entity2}'
      END AS month,
      ROUND(SUM(${metricColumn}) * 1.0 / COUNT(DISTINCT ${dateColumn}), 2) AS ${metricAlias}
    FROM ${table}
    WHERE EXTRACT(MONTH FROM ${dateColumn}) IN (${month1}, ${month2})
      AND EXTRACT(YEAR FROM ${dateColumn}) = ${year}
    GROUP BY EXTRACT(MONTH FROM ${dateColumn})
    ORDER BY ${metricAlias} DESC`;
  }
  
  return `SELECT 
    CASE EXTRACT(MONTH FROM ${dateColumn})
      WHEN ${month1} THEN '${entity1}'
      WHEN ${month2} THEN '${entity2}'
    END AS month,
    SUM(${metricColumn}) AS ${metricAlias}
  FROM ${table}
  WHERE EXTRACT(MONTH FROM ${dateColumn}) IN (${month1}, ${month2})
    AND EXTRACT(YEAR FROM ${dateColumn}) = ${year}
  GROUP BY EXTRACT(MONTH FROM ${dateColumn})
  ORDER BY ${metricAlias} DESC`;
}

/**
 * Build shift comparison query
 */
function buildShiftComparisonQuery(
  entity1: string,
  entity2: string,
  params: Record<string, any>,
  year: number,
  dateColumn: string,
  table: string,
  metricColumn: string,
  metricAlias: string,
  isProductivity: boolean
): string {
  const shift1 = entity1.toUpperCase().replace('SHIFT ', '');
  const shift2 = entity2.toUpperCase().replace('SHIFT ', '');
  
  // Date filter
  let dateFilter = '';
  if (params.date) {
    dateFilter = `AND ${dateColumn} = '${params.date}'`;
  } else if (params.month) {
    dateFilter = `AND EXTRACT(MONTH FROM ${dateColumn}) = ${params.month} AND EXTRACT(YEAR FROM ${dateColumn}) = ${year}`;
  } else if (params.date_start && params.date_end) {
    dateFilter = `AND ${dateColumn} BETWEEN '${params.date_start}' AND '${params.date_end}'`;
  } else {
    // Default to current year if no date specified
    dateFilter = `AND EXTRACT(YEAR FROM ${dateColumn}) = ${year}`;
  }
  
  if (isProductivity) {
    return `SELECT 
      shift,
      ROUND(SUM(${metricColumn}) * 1.0 / COUNT(DISTINCT ${dateColumn}), 2) AS ${metricAlias}
    FROM ${table}
    WHERE shift IN ('${shift1}', '${shift2}') ${dateFilter}
    GROUP BY shift
    ORDER BY ${metricAlias} DESC`;
  }
  
  return `SELECT 
    shift,
    SUM(${metricColumn}) AS ${metricAlias}
  FROM ${table}
  WHERE shift IN ('${shift1}', '${shift2}') ${dateFilter}
  GROUP BY shift
  ORDER BY ${metricAlias} DESC`;
}

/**
 * Build equipment comparison query
 */
function buildEquipmentComparisonQuery(
  entity1: string,
  entity2: string,
  params: Record<string, any>,
  year: number,
  isProductivity: boolean
): string {
  const equip1 = entity1.toUpperCase();
  const equip2 = entity2.toUpperCase();
  
  // Force trip_summary_by_date for equipment queries
  const table = TABLES.TRIPS;
  const dateColumn = 'trip_date';
  
  // Determine equipment column
  const isTipper = /^(BB-|DT-)/.test(equip1) || /^(BB-|DT-)/.test(equip2);
  const equipColumn = isTipper ? 'tipper_id' : 'excavator';
  
  // Date filter
  let dateFilter = '';
  if (params.date) {
    dateFilter = `AND ${dateColumn} = '${params.date}'`;
  } else if (params.month) {
    dateFilter = `AND EXTRACT(MONTH FROM ${dateColumn}) = ${params.month} AND EXTRACT(YEAR FROM ${dateColumn}) = ${year}`;
  } else if (params.date_start && params.date_end) {
    dateFilter = `AND ${dateColumn} BETWEEN '${params.date_start}' AND '${params.date_end}'`;
  }
  
  if (isProductivity) {
    return `SELECT 
      ${equipColumn},
      ROUND(SUM(trip_count) * 1.0 / COUNT(DISTINCT ${dateColumn}), 2) AS trips_per_day
    FROM ${table}
    WHERE ${equipColumn} IN ('${equip1}', '${equip2}') ${dateFilter}
    GROUP BY ${equipColumn}
    ORDER BY trips_per_day DESC`;
  }
  
  return `SELECT 
    ${equipColumn},
    SUM(trip_count) AS total_trips
  FROM ${table}
  WHERE ${equipColumn} IN ('${equip1}', '${equip2}') ${dateFilter}
  GROUP BY ${equipColumn}
  ORDER BY total_trips DESC`;
}

/**
 * Build date comparison query
 */
function buildDateComparisonQuery(
  entity1: string,
  entity2: string,
  dateColumn: string,
  table: string,
  metricColumn: string,
  metricAlias: string
): string {
  return `SELECT 
    ${dateColumn} AS date,
    SUM(${metricColumn}) AS ${metricAlias}
  FROM ${table}
  WHERE ${dateColumn} IN ('${entity1}', '${entity2}')
  GROUP BY ${dateColumn}
  ORDER BY ${metricAlias} DESC`;
}
