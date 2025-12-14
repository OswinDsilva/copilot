/**
 * SQL utility functions
 */

export function cleanSQL(sql: string): string {
  return sql.trim().replace(/;+$/, '');
}

export function addTableAliases(sql: string): string {
  // Add table aliases for JOINs
  if (sql.includes('JOIN')) {
    sql = sql.replace(/FROM production_summary\b/gi, 'FROM production_summary AS p');
    sql = sql.replace(/JOIN trip_summary_by_date\b/gi, 'JOIN trip_summary_by_date AS t');
  }
  return sql;
}

export function prefixAmbiguousColumns(sql: string): string {
  // Prefix ambiguous columns in JOIN queries
  const ambiguous = ['date', 'shift', 'id'];
  
  for (const col of ambiguous) {
    // Only prefix if it's in a JOIN query
    if (sql.includes('JOIN')) {
      sql = sql.replace(
        new RegExp(`\\b${col}\\b(?!\\s*AS)`, 'gi'),
        `p.${col}`
      );
    }
  }
  
  return sql;
}
