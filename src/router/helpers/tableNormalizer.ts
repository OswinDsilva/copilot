/**
 * Table Name Normalization Utility
 * 
 * Handles PostgreSQL case sensitivity for table names.
 * PostgreSQL treats unquoted identifiers as lowercase, so we need to ensure
 * all table references in SQL queries use the correct lowercase form.
 */

/**
 * Known table names in the database (all lowercase)
 */
export const KNOWN_TABLES = [
  'production_summary',
  'trip_summary_by_date',
  'uploaded_files',
  'rag_chunks',
  'rag_settings',
  'users',
  'sql_cache'
] as const;

/**
 * Table name aliases and variations that users might mention
 */
const TABLE_ALIASES: Record<string, string> = {
  // production_summary variations
  'production_summary': 'production_summary',
  'production summary': 'production_summary',
  'productionsummary': 'production_summary',
  'production': 'production_summary',
  'prod_summary': 'production_summary',
  'prod summary': 'production_summary',
  
  // trip_summary_by_date variations
  'trip_summary_by_date': 'trip_summary_by_date',
  'trip summary by date': 'trip_summary_by_date',
  'tripsummarybydate': 'trip_summary_by_date',
  'trip_summary': 'trip_summary_by_date',
  'trip summary': 'trip_summary_by_date',
  'trips': 'trip_summary_by_date',
  
  // uploaded_files variations
  'uploaded_files': 'uploaded_files',
  'uploaded files': 'uploaded_files',
  'uploadedfiles': 'uploaded_files',
  'files': 'uploaded_files',
  'documents': 'uploaded_files',
  
  // rag_chunks variations
  'rag_chunks': 'rag_chunks',
  'rag chunks': 'rag_chunks',
  'ragchunks': 'rag_chunks',
  'chunks': 'rag_chunks',
  
  // rag_settings variations
  'rag_settings': 'rag_settings',
  'rag settings': 'rag_settings',
  'ragsettings': 'rag_settings',
  'settings': 'rag_settings',
  
  // users variations
  'users': 'users',
  'user': 'users',
  
  // sql_cache variations
  'sql_cache': 'sql_cache',
  'sql cache': 'sql_cache',
  'sqlcache': 'sql_cache',
  'cache': 'sql_cache'
};

/**
 * Normalize a single table name to its correct lowercase form
 * 
 * @param tableName - Table name in any case/format
 * @returns Correct lowercase table name, or original if not recognized
 * 
 * @example
 * normalizeTableName("Production_Summary") → "production_summary"
 * normalizeTableName("TRIP_SUMMARY_BY_DATE") → "trip_summary_by_date"
 * normalizeTableName("production summary") → "production_summary"
 */
export function normalizeTableName(tableName: string): string {
  if (!tableName) return tableName;
  
  // Convert to lowercase and remove extra spaces
  const cleaned = tableName.toLowerCase().trim().replace(/\s+/g, '_');
  
  // Check direct match in known tables
  if (KNOWN_TABLES.includes(cleaned as any)) {
    return cleaned;
  }
  
  // Check aliases
  const normalized = cleaned.replace(/\s+/g, ' '); // Convert underscores to spaces for alias lookup
  if (TABLE_ALIASES[normalized]) {
    return TABLE_ALIASES[normalized];
  }
  
  // Check with underscores
  if (TABLE_ALIASES[cleaned]) {
    return TABLE_ALIASES[cleaned];
  }
  
  // Return original if not found (might be a valid table we don't know about)
  return cleaned;
}

/**
 * Normalize all table references in a SQL query
 * 
 * Finds all table names in FROM, JOIN, and UPDATE clauses and replaces them
 * with the correct lowercase form.
 * 
 * @param sql - SQL query with potentially incorrect case
 * @returns SQL query with normalized table names
 * 
 * @example
 * normalizeTableReferences("SELECT * FROM Production_Summary")
 * → "SELECT * FROM production_summary"
 * 
 * normalizeTableReferences("FROM production_summary JOIN Trip_Summary_By_Date")
 * → "FROM production_summary JOIN trip_summary_by_date"
 */
export function normalizeTableReferences(sql: string): string {
  if (!sql) return sql;
  
  let normalized = sql;
  
  // SQL keywords that should NOT be treated as table aliases
  const sqlKeywords = new Set([
    'WHERE', 'ORDER', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 
    'UNION', 'INTERSECT', 'EXCEPT', 'JOIN', 'INNER', 'LEFT', 
    'RIGHT', 'FULL', 'CROSS', 'ON', 'USING', 'AND', 'OR', 'NOT',
    'AS', 'BY', 'IN', 'IS', 'NULL', 'TRUE', 'FALSE', 'ASC', 'DESC'
  ]);
  
  // Pattern 1: FROM clause (with optional AS alias)
  // Two separate patterns: one for explicit AS, one for implicit alias
  // Only match implicit alias if it's NOT a SQL keyword
  
  // First handle explicit "AS alias" syntax
  const fromWithExplicitAlias = /\bFROM\s+([a-zA-Z0-9_]+)\s+AS\s+([a-zA-Z0-9_]+)\b/gi;
  normalized = normalized.replace(fromWithExplicitAlias, (_match, tableName, alias) => {
    const correctTable = normalizeTableName(tableName);
    return `FROM ${correctTable} AS ${alias}`;
  });
  
  // Then handle implicit aliases (but skip if next word is a SQL keyword)
  const fromWithImplicitAlias = /\bFROM\s+([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)(?=\s)/gi;
  normalized = normalized.replace(fromWithImplicitAlias, (_match, tableName, possibleAlias) => {
    const correctTable = normalizeTableName(tableName);
    // Only treat as alias if it's not a SQL keyword
    if (!sqlKeywords.has(possibleAlias.toUpperCase())) {
      return `FROM ${correctTable} AS ${possibleAlias}`;
    }
    // If it's a keyword, just normalize the table name and leave the keyword untouched
    return `FROM ${correctTable} ${possibleAlias}`;
  });
  
  // Pattern 2: JOIN clauses (INNER JOIN, LEFT JOIN, RIGHT JOIN, FULL JOIN)
  // Handle explicit AS first, then implicit aliases
  
  // Explicit AS in JOINs
  const joinWithExplicitAlias = /\b((?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN)\s+([a-zA-Z0-9_]+)\s+AS\s+([a-zA-Z0-9_]+)\b/gi;
  normalized = normalized.replace(joinWithExplicitAlias, (_match, joinType, tableName, alias) => {
    const correctTable = normalizeTableName(tableName);
    return `${joinType} ${correctTable} AS ${alias}`;
  });
  
  // Implicit aliases in JOINs (skip SQL keywords)
  const joinWithImplicitAlias = /\b((?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN)\s+([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)(?=\s)/gi;
  normalized = normalized.replace(joinWithImplicitAlias, (_match, joinType, tableName, possibleAlias) => {
    const correctTable = normalizeTableName(tableName);
    if (!sqlKeywords.has(possibleAlias.toUpperCase())) {
      return `${joinType} ${correctTable} AS ${possibleAlias}`;
    }
    return `${joinType} ${correctTable} ${possibleAlias}`;
  });
  
  // Pattern 3: UPDATE clause
  // Matches: UPDATE table_name SET ...
  // Use positive lookahead to ensure it's followed by SET, not a keyword
  const updatePattern = /\bUPDATE\s+([a-zA-Z0-9_]+)(?=\s+SET\b)/gi;
  normalized = normalized.replace(updatePattern, (_match, tableName) => {
    const correctTable = normalizeTableName(tableName);
    return `UPDATE ${correctTable}`;
  });
  
  // Pattern 4: INSERT INTO clause
  // Matches: INSERT INTO table_name ... (followed by column list or VALUES)
  const insertPattern = /\bINSERT\s+INTO\s+([a-zA-Z0-9_]+)(?=\s*[\(]|\s+VALUES\b)/gi;
  normalized = normalized.replace(insertPattern, (_match, tableName) => {
    const correctTable = normalizeTableName(tableName);
    return `INSERT INTO ${correctTable}`;
  });
  
  // Pattern 5: DELETE FROM clause
  // Matches: DELETE FROM table_name ... (but not if followed by a keyword)
  // Two passes: explicit AS, then implicit aliases
  
  // Explicit AS in DELETE (rare but valid)
  const deleteWithExplicitAlias = /\bDELETE\s+FROM\s+([a-zA-Z0-9_]+)\s+AS\s+([a-zA-Z0-9_]+)\b/gi;
  normalized = normalized.replace(deleteWithExplicitAlias, (_match, tableName, alias) => {
    const correctTable = normalizeTableName(tableName);
    return `DELETE FROM ${correctTable} AS ${alias}`;
  });
  
  // Implicit aliases in DELETE (or just table name before WHERE, USING, etc.)
  const deleteWithImplicitAlias = /\bDELETE\s+FROM\s+([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)(?=\s)/gi;
  normalized = normalized.replace(deleteWithImplicitAlias, (_match, tableName, possibleAlias) => {
    const correctTable = normalizeTableName(tableName);
    if (!sqlKeywords.has(possibleAlias.toUpperCase())) {
      return `DELETE FROM ${correctTable} AS ${possibleAlias}`;
    }
    return `DELETE FROM ${correctTable} ${possibleAlias}`;
  });
  
  return normalized;
}

/**
 * Validate that all table references in SQL are known tables
 * 
 * @param sql - SQL query to validate
 * @returns Object with validation result and list of unknown tables
 */
export function validateTableReferences(sql: string): { 
  valid: boolean; 
  unknownTables: string[];
  message?: string;
} {
  // Match table names after FROM, JOIN, UPDATE, INSERT INTO, DELETE FROM
  // Use word boundaries and ensure we only capture the table name, not aliases or keywords
  const tablePattern = /\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?[a-zA-Z0-9_]+)?/gi;
  const matches = [...sql.matchAll(tablePattern)];
  
  const unknownTables: string[] = [];
  const seenTables = new Set<string>();
  
  for (const match of matches) {
    const tableName = match[1].toLowerCase();
    
    if (!seenTables.has(tableName)) {
      seenTables.add(tableName);
      
      if (!KNOWN_TABLES.includes(tableName as any)) {
        unknownTables.push(tableName);
      }
    }
  }
  
  if (unknownTables.length > 0) {
    return {
      valid: false,
      unknownTables,
      message: `Unknown table(s): ${unknownTables.join(', ')}. Valid tables: ${KNOWN_TABLES.join(', ')}`
    };
  }
  
  return { valid: true, unknownTables: [] };
}

/**
 * Extract all table names from a SQL query
 * 
 * @param sql - SQL query
 * @returns Array of table names found in the query
 */
export function extractTableNames(sql: string): string[] {
  // Match table names after FROM, JOIN, UPDATE, INSERT INTO, DELETE FROM
  // Only capture the table name, not aliases or keywords
  const tablePattern = /\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?[a-zA-Z0-9_]+)?/gi;
  const matches = [...sql.matchAll(tablePattern)];
  
  const tables = new Set<string>();
  for (const match of matches) {
    tables.add(match[1].toLowerCase());
  }
  
  return Array.from(tables);
}
