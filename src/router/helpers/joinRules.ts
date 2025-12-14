/**
 * Centralized JOIN rules and table selection logic
 * Provides reusable JOIN snippets for SQL builders
 */

/**
 * Table names used in the system
 */
export const TABLES = {
  PRODUCTION: 'production_summary',
  TRIPS: 'trip_summary_by_date',
  EQUIPMENT: 'equipment',
  UPLOADED_FILES: 'uploaded_files',
} as const;

/**
 * Column mappings for different tables
 */
export const COLUMNS = {
  production_summary: {
    date: 'date',
    shift: 'shift',
    tonnage: 'qty_ton',
    volume: 'qty_m3',
    targetTon: 'target_ton',
    targetM3: 'target_m3',
    totalTrips: 'total_trips',
  },
  trip_summary_by_date: {
    date: 'trip_date',
    shift: 'shift',
    tipper: 'tipper_id',
    excavator: 'excavator',
    tripCount: 'trip_count',
    route: 'route_or_face',
  },
} as const;

/**
 * JOIN production_summary with trip_summary_by_date
 * Use this when you need both tonnage data AND equipment-level details
 * 
 * WARNING: Be careful with this join - can cause data duplication
 * Prefer subqueries for aggregations instead
 */
export function joinProductionWithTrips(
  productionAlias: string = 'p',
  tripAlias: string = 't'
): string {
  return `FROM ${TABLES.PRODUCTION} ${productionAlias}
LEFT JOIN ${TABLES.TRIPS} ${tripAlias} 
  ON ${productionAlias}.date = ${tripAlias}.trip_date 
  AND ${productionAlias}.shift = ${tripAlias}.shift`;
}

/**
 * Select table based on query requirements
 * Returns table name and date column name
 */
export function selectTable(requirements: {
  needsEquipment?: boolean;
  needsTonnage?: boolean;
  needsTrips?: boolean;
  needsRoutes?: boolean;
}): {
  table: string;
  dateColumn: string;
} {
  const { needsEquipment, needsTonnage, needsTrips, needsRoutes } = requirements;
  
  // trip_summary_by_date has: equipment IDs, routes, trip_count
  // production_summary has: tonnage, volume, targets
  
  // If needs equipment or routes, must use trip_summary_by_date
  if (needsEquipment || needsRoutes) {
    return {
      table: TABLES.TRIPS,
      dateColumn: COLUMNS.trip_summary_by_date.date,
    };
  }
  
  // If needs trips specifically (and not tonnage), use trip_summary_by_date
  if (needsTrips && !needsTonnage) {
    return {
      table: TABLES.TRIPS,
      dateColumn: COLUMNS.trip_summary_by_date.date,
    };
  }
  
  // Default to production_summary for tonnage/volume queries
  return {
    table: TABLES.PRODUCTION,
    dateColumn: COLUMNS.production_summary.date,
  };
}

/**
 * Determine metric column and alias based on query
 */
export function selectMetric(query: string): {
  column: string;
  alias: string;
  table: string;
} {
  const isTrips = /\b(trips?|trip count)\b/i.test(query);
  const isVolume = /m3|cubic\s*meters?|volume/i.test(query);
  
  if (isTrips) {
    return {
      column: 'trip_count',
      alias: 'total_trips',
      table: TABLES.TRIPS,
    };
  }
  
  if (isVolume) {
    return {
      column: 'qty_m3',
      alias: 'total_volume',
      table: TABLES.PRODUCTION,
    };
  }
  
  // Default to tonnage
  return {
    column: 'qty_ton',
    alias: 'total_tonnage',
    table: TABLES.PRODUCTION,
  };
}

/**
 * Build ORDER BY clause with direction
 */
export function buildOrderBy(
  column: string,
  direction: 'ASC' | 'DESC' = 'DESC',
  additionalColumns?: string[]
): string {
  const columns = [column, ...(additionalColumns || [])];
  return `ORDER BY ${columns.join(', ')} ${direction}`;
}

/**
 * Build LIMIT clause
 */
export function buildLimit(limit: number | null): string {
  return limit ? `LIMIT ${limit}` : '';
}

/**
 * Build GROUP BY clause
 */
export function buildGroupBy(...columns: string[]): string {
  return `GROUP BY ${columns.join(', ')}`;
}

/**
 * Build HAVING clause for filtered aggregations
 */
export function buildHaving(condition: string): string {
  return `HAVING ${condition}`;
}

/**
 * Convert month number to name using CASE statement
 * Returns the CASE expression for use in SELECT
 */
export function monthNumberToName(monthColumn: string = 'EXTRACT(MONTH FROM date)'): string {
  return `CASE ${monthColumn} WHEN 1 THEN 'January' WHEN 2 THEN 'February' WHEN 3 THEN 'March' WHEN 4 THEN 'April' WHEN 5 THEN 'May' WHEN 6 THEN 'June' WHEN 7 THEN 'July' WHEN 8 THEN 'August' WHEN 9 THEN 'September' WHEN 10 THEN 'October' WHEN 11 THEN 'November' WHEN 12 THEN 'December' END`;
}
