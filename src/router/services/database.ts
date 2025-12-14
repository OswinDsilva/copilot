import { getSupabaseClient } from '../../utils/supabase';
import { validateSQLQuery, estimateTokens } from '../../utils/validation';
import { hashQuery } from '../../utils/supabase';
import type { RAGSettings, ChatMessage, UploadedFile, DiagnosticEntry } from '../../types';
import { retryWithBackoff, databaseCircuitBreaker } from '../helpers/errorHandling';
import { normalizeTableReferences } from '../helpers/tableNormalizer';

const supabase = getSupabaseClient();

// Auto-fix missing GROUP BY columns when using aggregate functions
function fixMissingGroupBy(sql: string): { sql: string; fixed: boolean } {
  // Check if query has aggregate functions (SUM, AVG, COUNT, MIN, MAX)
  const hasAggregates = /\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/i.test(sql);
  if (!hasAggregates) return { sql, fixed: false };
  
  // Check if query already has GROUP BY
  const hasGroupBy = /\bGROUP\s+BY\b/i.test(sql);
  
  // Extract SELECT columns (excluding aggregates and their aliases)
  const selectMatch = sql.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
  if (!selectMatch) return { sql, fixed: false };
  
  const selectClause = selectMatch[1];
  
  // Find non-aggregate columns in SELECT
  const columns = selectClause.split(',').map(c => c.trim());
  const nonAggregateColumns: string[] = [];
  
  for (const col of columns) {
    // Skip aggregate functions
    if (/\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/i.test(col)) continue;
    
    // Extract column name (handle aliases like "col AS alias")
    const colName = col.split(/\s+AS\s+/i)[0].trim();
    
    // Skip literals and expressions
    if (/^[\d'".]|^\(/.test(colName)) continue;
    
    // Add column if it looks like a simple column reference
    if (/^[\w.]+$/i.test(colName)) {
      nonAggregateColumns.push(colName);
    }
  }
  
  if (nonAggregateColumns.length === 0) return { sql, fixed: false };
  
  if (!hasGroupBy) {
    // Add GROUP BY clause
    const groupByClause = `GROUP BY ${nonAggregateColumns.join(', ')}`;
    
    // Insert before ORDER BY if it exists, otherwise at the end
    if (/\bORDER\s+BY\b/i.test(sql)) {
      sql = sql.replace(/(\bORDER\s+BY\b)/i, `${groupByClause}\n$1`);
    } else if (/\bLIMIT\b/i.test(sql)) {
      sql = sql.replace(/(\bLIMIT\b)/i, `${groupByClause}\n$1`);
    } else {
      sql = sql.trim() + `\n${groupByClause}`;
    }
    
    return { sql, fixed: true };
  } else {
    // GROUP BY exists - check if all non-aggregate columns are included
    const groupByMatch = sql.match(/GROUP\s+BY\s+([\s\S]*?)(?:\s+HAVING|\s+ORDER|\s+LIMIT|$)/i);
    if (!groupByMatch) return { sql, fixed: false };
    
    const groupByCols = groupByMatch[1].split(',').map(c => c.trim().toLowerCase());
    const missingCols = nonAggregateColumns.filter(
      col => !groupByCols.includes(col.toLowerCase())
    );
    
    if (missingCols.length > 0) {
      // Add missing columns to GROUP BY
      const newGroupBy = `GROUP BY ${[...groupByCols, ...missingCols.map(c => c.toLowerCase())].join(', ')}`;
      sql = sql.replace(/GROUP\s+BY\s+[\s\S]*?(?=\s+HAVING|\s+ORDER|\s+LIMIT|$)/i, newGroupBy);
      return { sql, fixed: true };
    }
  }
  
  return { sql, fixed: false };
}

// SQL Validator: Detect and fix common LLM-generated anti-patterns
function detectAndFixBogusFilters(query: string): { sql: string; fixed: boolean; issues: string[]; corrections: Record<string, string> } {
  let sql = query;
  const issues: string[] = [];
  const corrections: Record<string, string> = {};
  let fixed = false;

  // Pattern 0: Fix missing GROUP BY columns for aggregate queries
  const groupByFix = fixMissingGroupBy(sql);
  if (groupByFix.fixed) {
    sql = groupByFix.sql;
    issues.push('Auto-fixed missing GROUP BY columns for aggregate query');
    fixed = true;
  }

  // Pattern 0A: BB- IDs (tippers) used with excavator column (CRITICAL ERROR)
  const tipperIdInExcavatorPattern = /excavator\s*=\s*['"]BB-\d+['"]/i;
  if (tipperIdInExcavatorPattern.test(sql)) {
    const match = sql.match(/excavator\s*=\s*['"](BB-\d+)['"]/i);
    if (match) {
      const tipperId = match[1];
      issues.push(`CRITICAL: BB- prefix is for tippers only, not excavators. Cannot use '${tipperId}' with excavator column.`);
      throw new Error(
        `Equipment ID Error: BB- prefix identifies tippers, not excavators. ` +
        `'${tipperId}' should be used with tipper_id column, not excavator column. ` +
        `Hint: Use tipper_id = '${tipperId}' instead.`
      );
    }
  }

  // Pattern 0B: EX- IDs (excavators) used with tipper_id column (CRITICAL ERROR)
  const excavatorIdInTipperPattern = /tipper_id\s*=\s*['"]EX-\d+['"]/i;
  if (excavatorIdInTipperPattern.test(sql)) {
    const match = sql.match(/tipper_id\s*=\s*['"](EX-\d+)['"]/i);
    if (match) {
      const excavatorId = match[1];
      issues.push(`CRITICAL: EX- prefix is for excavators only, not tippers. Cannot use '${excavatorId}' with tipper_id column.`);
      throw new Error(
        `Equipment ID Error: EX- prefix identifies excavators, not tippers. ` +
        `'${excavatorId}' should be used with excavator column, not tipper_id column. ` +
        `Hint: Use excavator = '${excavatorId}' instead.`
      );
    }
  }

  // Pattern 0C: Equipment ID filters on production_summary table (CRITICAL ERROR)
  // The production_summary.excavator column is numeric (hours), not text (equipment ID)
  // Equipment IDs like 'EX-189', 'BB-001' should query trip_summary_by_date instead
  const equipmentIdPattern = /\b[A-Z]{2,4}-?\d{1,4}\b/;
  if (/FROM\s+production_summary/i.test(sql) && /WHERE.*excavator\s*=\s*['"]([^'"]+)['"]/i.test(sql)) {
    const match = sql.match(/WHERE.*excavator\s*=\s*['"]([^'"]+)['"]/i);
    if (match && equipmentIdPattern.test(match[1])) {
      const equipmentId = match[1];
      issues.push(`CRITICAL: Cannot query production_summary with equipment ID '${equipmentId}'. ` +
                  `The 'excavator' column in production_summary is numeric (operating hours), not equipment IDs. ` +
                  `Equipment-specific queries must use trip_summary_by_date table instead.`);
      // This is a critical error - cannot auto-fix, must reject query
      throw new Error(
        `Database Schema Error: The 'excavator' column in production_summary contains numeric operating hours, not equipment IDs. ` +
        `To query production for equipment '${equipmentId}', use the trip_summary_by_date table which has equipment IDs. ` +
        `Hint: The router should have generated a query using trip_summary_by_date for equipment-specific queries.`
      );
    }
  }

  // Pattern 1: WHERE excavator = 'excavator' or 'tipper' (treating column names as values)
  const bogusExcavatorPattern = /WHERE\s+([^;]+\s+)?excavator\s*=\s*['"](?:excavator|tipper)['"]/i;
  if (bogusExcavatorPattern.test(sql)) {
    issues.push("Removed bogus filter: excavator = 'excavator' or 'tipper'");
    // Remove the entire bogus clause
    sql = sql.replace(/AND\s+excavator\s*=\s*['"](?:excavator|tipper)['"]/gi, '');
    sql = sql.replace(/excavator\s*=\s*['"](?:excavator|tipper)['"]\s+AND/gi, '');
    fixed = true;
  }

  // Pattern 2: OR clauses with bogus equipment filters
  const bogusOrPattern = /\(excavator\s*=\s*['"](?:excavator|tipper)['"]\s+OR\s+excavator\s*=\s*['"](?:excavator|tipper)['"]\)/gi;
  if (bogusOrPattern.test(sql)) {
    issues.push("Removed bogus OR clause with equipment type filters");
    sql = sql.replace(/AND\s+\(excavator\s*=\s*['"](?:excavator|tipper)['"]\s+OR\s+excavator\s*=\s*['"](?:excavator|tipper)['"]\)/gi, '');
    fixed = true;
  }

  // Pattern 3: WHERE tipper_id = 'tipper' or 'excavator'
  const bogusTipperPattern = /WHERE\s+([^;]+\s+)?tipper_id\s*=\s*['"](?:tipper|excavator)['"]/i;
  if (bogusTipperPattern.test(sql)) {
    issues.push("Removed bogus filter: tipper_id = 'tipper' or 'excavator'");
    sql = sql.replace(/AND\s+tipper_id\s*=\s*['"](?:tipper|excavator)['"]/gi, '');
    sql = sql.replace(/tipper_id\s*=\s*['"](?:tipper|excavator)['"]\s+AND/gi, '');
    fixed = true;
  }

  // Pattern 4: Standalone bogus WHERE that leaves query invalid
  // If WHERE clause is now empty or only has whitespace after removal
  sql = sql.replace(/WHERE\s+GROUP\s+BY/gi, 'GROUP BY');
  sql = sql.replace(/WHERE\s+ORDER\s+BY/gi, 'ORDER BY');
  sql = sql.replace(/WHERE\s+LIMIT/gi, 'LIMIT');
  sql = sql.replace(/WHERE\s*$/gi, '');

  // Pattern 5: Schema-based column validation with safe auto-fix
  console.log('[SQL Validator] Input SQL:', sql);
  const schemaValidation = validateAgainstSchema(sql);
  console.log('[SQL Validator] Schema validation result:', schemaValidation);
  if (schemaValidation.invalidColumns.length > 0) {
    console.log('[SQL Validator] Invalid columns detected:', schemaValidation.invalidColumns);
    console.log('[SQL Validator] Suggestions:', schemaValidation.suggestions);
    console.log('[SQL Validator] Corrections:', schemaValidation.corrections);
    
    // Store corrections for error handling later
    Object.assign(corrections, schemaValidation.corrections);
    
    // Try safe auto-fix for simple cases
    const autoFixResult = safeAutoFixColumns(sql, schemaValidation.corrections);
    
    if (autoFixResult.fixed) {
      sql = autoFixResult.sql;
      fixed = true;
      issues.push(...autoFixResult.changes);
    } else {
      // Couldn't auto-fix safely - REJECT the query to prevent database errors
      // Return the SQL as-is but mark it with schema errors for caller to handle
      issues.push('SCHEMA_ERROR: Query contains invalid columns that cannot be auto-fixed');
      // Couldn't auto-fix safely - REJECT the query to prevent database errors
      // Return the SQL as-is but mark it with schema errors for caller to handle
      issues.push('SCHEMA_ERROR: Query contains invalid columns that cannot be auto-fixed');
      issues.push(...schemaValidation.suggestions);
    }
  }

  const finalSQL = sql.trim();
  console.log('[SQL Validator] Final SQL output:', finalSQL);
  console.log('[SQL Validator] Fixed:', fixed, 'Issues:', issues);
  return { sql: finalSQL, fixed, issues, corrections };
}

// Schema-based column validator
function validateAgainstSchema(sql: string): { 
  invalidColumns: string[]; 
  suggestions: string[];
  corrections: Record<string, string>;
} {
  const invalidColumns: string[] = [];
  const suggestions: string[] = [];
  const corrections: Record<string, string> = {};
  
  // Define table schemas
  const tableSchemas: Record<string, string[]> = {
    'production_summary': [
      'id', 'user_id', 'date', 'shift', 'excavator', 'dumper', 
      'trip_count_for_mining', 'qty_ton', 'trip_count_for_reclaim', 
      'qty_m3', 'total_trips', 'grader', 'dozer', 'created_at'
    ],
    'trip_summary_by_date': [
      'id', 'user_id', 'trip_date', 'shift', 'tipper_id', 'excavator', 
      'route_or_face', 'trip_count', 'remarks', 'created_at'
    ],
    'rag_chunks': [
      'id', 'file_id', 'chunk_index', 'content', 'embedding',
      'metadata', 'created_at'
    ],
    'uploaded_files': [
      'id', 'filename', 'file_path', 'file_type', 'file_size',
      'upload_date', 'status', 'metadata', 'created_at'
    ]
  };
  
  // Table-specific column aliases (key format: "tablename.wrongcolumn")
  const tableSpecificAliases: Record<string, string> = {
    // production_summary uses 'date', not 'trip_date'
    'production_summary.trip_date': 'date',
    
    // trip_summary_by_date uses 'trip_date', not 'date'
    'trip_summary_by_date.date': 'trip_date',
    
    // trip_summary_by_date does NOT have tonnage columns - only trip_count
    'trip_summary_by_date.qty_ton': '__INVALID_NO_TONNAGE_IN_TRIP_TABLE__',
    'trip_summary_by_date.qty_m3': '__INVALID_NO_TONNAGE_IN_TRIP_TABLE__',
    'trip_summary_by_date.tonnage': '__INVALID_NO_TONNAGE_IN_TRIP_TABLE__',
    'trip_summary_by_date.total_tonnage': '__INVALID_NO_TONNAGE_IN_TRIP_TABLE__',
  };
  
  // Common column name mistakes and their corrections (table-agnostic)
  const commonMistakes: Record<string, string> = {
    // production_summary table mistakes
    'total_tonnage': 'qty_ton',
    'tonnage': 'qty_ton',
    'production_tons': 'qty_ton',
    'volume_m3': 'qty_m3',
    'production_qty': 'qty_ton',
    
    // trip_summary_by_date table mistakes
    'trips': 'trip_count',
    'total_trips': 'trip_count',
    'num_trips': 'trip_count',
    'trip_id': 'tipper_id',
    'vehicle_id': 'tipper_id',
    'truck_id': 'tipper_id',
    'dumper_id': 'tipper_id',
    
    // Common across tables
    'equipment_count': 'excavator'
  };
  
  // SQL keywords and functions to ignore
  const SQL_KEYWORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
    'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL',
    'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'ASC', 'DESC',
    'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'DISTINCT', 'CASE', 'WHEN', 'THEN',
    'ELSE', 'END', 'CAST', 'EXTRACT', 'DATE', 'TIMESTAMP', 'INTERVAL',
    'COALESCE', 'NULLIF', 'OVER', 'PARTITION', 'WINDOW', 'ROW_NUMBER',
    // Date/time functions
    'DATE_TRUNC', 'DATE_PART', 'TO_TIMESTAMP', 'TO_DATE', 'TO_CHAR',
    'AGE', 'CLOCK_TIMESTAMP', 'TRANSACTION_TIMESTAMP', 'STATEMENT_TIMESTAMP',
    // Date/time units used in EXTRACT, DATE_TRUNC, etc.
    'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'QUARTER', 'WEEK',
    'DOW', 'DOY', 'EPOCH', 'MICROSECONDS', 'MILLISECONDS', 'TIMEZONE',
    // String functions and keywords
    'TRUE', 'FALSE', 'UNKNOWN', 'ALL', 'ANY', 'SOME', 'EXISTS',
    'UNION', 'INTERSECT', 'EXCEPT', 'CROSS', 'NATURAL', 'USING',
    'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'NOW',
    // Numeric and type keywords
    'INTEGER', 'NUMERIC', 'DECIMAL', 'REAL', 'DOUBLE', 'PRECISION',
    'SMALLINT', 'BIGINT', 'SERIAL', 'BIGSERIAL', 'VARCHAR', 'CHAR', 'TEXT',
    'BOOLEAN', 'BOOL', 'BYTEA', 'JSON', 'JSONB', 'UUID', 'ARRAY',
    // Aggregate window function keywords
    'FIRST_VALUE', 'LAST_VALUE', 'LAG', 'LEAD', 'RANK', 'DENSE_RANK',
    'ROW', 'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT'
  ]);
  
  // Check if query has table-prefixed columns (e.g., p.date, t.tipper_id)
  // This indicates a JOIN with table aliases - skip validation as it's too complex
  const hasTablePrefixes = /\b[a-z]\.\w+/i.test(sql);
  if (hasTablePrefixes) {
    // JOIN queries with table aliases are handled by the database
    // Our simple validator can't handle multiple table schemas
    return { invalidColumns, suggestions, corrections };
  }
  
  // Check if query has multiple subqueries (SELECT ... FROM ... WHERE ... SELECT ... FROM ...)
  // Skip validation for complex multi-table subqueries
  const selectCount = (sql.match(/SELECT/gi) || []).length;
  if (selectCount > 1) {
    console.log('[SQL Validator] Multiple SELECT statements detected - skipping validation for subqueries');
    return { invalidColumns, suggestions, corrections };
  }
  
  // Extract table name from SQL
  const tableMatch = sql.match(/FROM\s+(\w+)/i);
  if (!tableMatch) {
    return { invalidColumns, suggestions, corrections };
  }
  
  const tableName = tableMatch[1].toLowerCase();
  const validColumns = tableSchemas[tableName];
  
  if (!validColumns) {
    // Unknown table, can't validate
    return { invalidColumns, suggestions, corrections };
  }
  
  // First, remove all string literals from SQL to avoid false positives
  // Replace 'EX-189', "BB-44", etc. with placeholder to prevent their contents from being checked
  const sqlWithoutStrings = sql.replace(/'[^']*'/g, "'STRING'").replace(/"[^"]*"/g, '"STRING"');
  
  // Extract all word tokens from SQL (potential column names) - but from version without string literals
  const tokens = sqlWithoutStrings.match(/\b\w+\b/g) || [];
  
  // Track which columns we've already reported (avoid duplicates)
  const reported = new Set<string>();
  
  // Extract aliases (tokens that appear after AS keyword) to skip them
  const aliasPattern = /\bAS\s+(\w+)/gi;
  const aliases = new Set<string>();
  let aliasMatch;
  while ((aliasMatch = aliasPattern.exec(sqlWithoutStrings)) !== null) {
    aliases.add(aliasMatch[1].toLowerCase());
  }
  
  // Also detect implicit aliases (column_expr alias_name without AS keyword)
  // Pattern: ) or word, space, word (the alias), then comma/FROM/WHERE/end of string
  const selectClause = sqlWithoutStrings.match(/SELECT\s+(.*?)\s+FROM/is)?.[1] || '';
  console.log('[SQL Validator] SELECT clause:', selectClause);
  // Match: closing paren or word, space(s), alias word, then comma or end of select
  const implicitAliasPattern = /[)\w]\s+(\w+)(?:\s*[,]|$)/g;
  let implicitMatch;
  while ((implicitMatch = implicitAliasPattern.exec(selectClause)) !== null) {
    const potentialAlias = implicitMatch[1].toLowerCase();
    console.log('[SQL Validator] Potential implicit alias:', potentialAlias);
    // Skip SQL keywords that might match this pattern
    if (!SQL_KEYWORDS.has(potentialAlias.toUpperCase())) {
      aliases.add(potentialAlias);
      console.log('[SQL Validator] Added implicit alias:', potentialAlias);
    }
  }
  console.log('[SQL Validator] All aliases:', Array.from(aliases));
  
  // Extract function names (tokens followed by opening parenthesis)
  const functionPattern = /\b(\w+)\s*\(/gi;
  const functions = new Set<string>();
  let funcMatch;
  while ((funcMatch = functionPattern.exec(sqlWithoutStrings)) !== null) {
    functions.add(funcMatch[1].toLowerCase());
  }
  
  // Check each token
  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    
    // Skip single-letter tokens (likely SQL syntax fragments, not column names)
    if (token.length === 1) {
      continue;
    }
    
    // Skip function names (followed by parenthesis)
    if (functions.has(lowerToken)) {
      continue;
    }
    
    // Skip single-letter tokens (likely SQL syntax fragments, not column names)
    if (token.length === 1) {
      continue;
    }
    
    // Skip function names (followed by parenthesis)
    if (functions.has(lowerToken)) {
      continue;
    }
    
    // Skip SQL keywords
    if (SQL_KEYWORDS.has(token.toUpperCase())) {
      continue;
    }
    
    // Skip table names
    if (Object.keys(tableSchemas).includes(lowerToken)) {
      continue;
    }
    
    // Skip valid columns
    if (validColumns.includes(lowerToken)) {
      continue;
    }
    
    // Skip numbers
    if (/^\d+$/.test(token)) {
      continue;
    }
    
    // Skip tokens that look like string literals
    if (/^['"]/.test(token)) {
      continue;
    }
    
    // Skip aliases (tokens after AS keyword)
    if (aliases.has(lowerToken)) {
      continue;
    }
    
    // Skip tokens that appear inside function calls (e.g., MONTH in EXTRACT(MONTH FROM ...))
    // Pattern: token appears after opening paren and before closing paren
    const insideFunctionPattern = new RegExp(`\\(\\s*[^)]*\\b${token}\\b[^)]*\\)`, 'i');
    if (insideFunctionPattern.test(sql)) {
      // Further check: if it's a SQL keyword used inside a function (like MONTH, YEAR, etc.)
      // these are valid and should be skipped
      const upperToken = token.toUpperCase();
      const dateTimeParts = ['MONTH', 'YEAR', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'QUARTER', 'WEEK'];
      if (dateTimeParts.includes(upperToken)) {
        continue;
      }
    }
    
    // Check table-specific column aliases first (e.g., trip_date vs date)
    const tableSpecificKey = `${tableName}.${lowerToken}`;
    if (tableSpecificAliases[tableSpecificKey]) {
      if (!reported.has(lowerToken)) {
        invalidColumns.push(token);
        corrections[lowerToken] = tableSpecificAliases[tableSpecificKey];
        suggestions.push(
          `Column '${token}' doesn't exist in table '${tableName}'. Use '${tableSpecificAliases[tableSpecificKey]}' instead.`
        );
        reported.add(lowerToken);
      }
      continue;
    }
    
    // Check if it's a common mistake with known correction
    if (commonMistakes[lowerToken]) {
      if (!reported.has(lowerToken)) {
        invalidColumns.push(token);
        corrections[lowerToken] = commonMistakes[lowerToken];
        suggestions.push(
          `Column '${token}' doesn't exist in ${tableName}. Did you mean '${commonMistakes[lowerToken]}'?`
        );
        reported.add(lowerToken);
      }
    } else {
      // Unknown column that doesn't match any valid column or known mistake
      // Only report if it looks like it could be a column reference (not a value)
      // Be more strict to avoid false positives from SQL function arguments
      
      // Skip if token appears inside EXTRACT(...) function
      const extractPattern = new RegExp(`EXTRACT\\s*\\([^)]*\\b${token}\\b[^)]*\\)`, 'i');
      if (extractPattern.test(sql)) {
        continue;
      }
      
      // Skip if token appears inside DATE_TRUNC(...) function
      const dateTruncPattern = new RegExp(`DATE_TRUNC\\s*\\([^)]*\\b${token}\\b[^)]*\\)`, 'i');
      if (dateTruncPattern.test(sql)) {
        continue;
      }
      
      // Skip if token appears inside CAST(...) function
      const castPattern = new RegExp(`CAST\\s*\\([^)]*\\b${token}\\b[^)]*\\)`, 'i');
      if (castPattern.test(sql)) {
        continue;
      }
      
      // Check if token appears in SELECT, WHERE, GROUP BY, ORDER BY, or HAVING context
      // But NOT inside parentheses (which would indicate function arguments)
      const columnContextPattern = new RegExp(
        `(SELECT|WHERE|GROUP\\s+BY|ORDER\\s+BY|HAVING|JOIN|ON)\\s+[^(,;]*\\b${token}\\b`,
        'i'
      );
      
      if (columnContextPattern.test(sql) && !reported.has(lowerToken)) {
        invalidColumns.push(token);
        suggestions.push(
          `Column '${token}' doesn't exist in table '${tableName}'. Valid columns: ${validColumns.join(', ')}`
        );
        reported.add(lowerToken);
      }
    }
  }
  
  return { invalidColumns, suggestions, corrections };
}

// Safe auto-fix for invented columns (only handles simple, unambiguous cases)
function safeAutoFixColumns(sql: string, corrections: Record<string, string>): {
  sql: string;
  fixed: boolean;
  changes: string[];
} {
  let fixedSql = sql;
  const changes: string[] = [];
  let hasUnsafeContext = false;
  
  // Safety checks: Don't auto-fix if query has complex contexts
  // These contexts make column replacement ambiguous:
  
  // 1. Check for GROUP BY - invented column in SELECT might match GROUP BY reference
  const hasGroupBy = /\bGROUP\s+BY\b/i.test(sql);
  
  // 2. Check for ORDER BY - invented column might be an alias reference in ORDER BY
  const hasOrderBy = /\bORDER\s+BY\b/i.test(sql);
  
  // 3. Check for function calls - invented column inside function is risky
  const hasFunctions = /\b(COALESCE|CAST|EXTRACT|CASE|NULLIF)\s*\(/i.test(sql);
  
  // 4. Check for JOINs - need to handle table prefixes (t.column vs p.column)
  const hasJoin = /\bJOIN\b/i.test(sql);
  
  // If any complex context exists, skip auto-fix (too risky)
  // NOTE: Removed hasAsAliases check - AS keyword is valid PostgreSQL syntax and shouldn't prevent processing
  if (hasGroupBy || hasOrderBy || hasFunctions || hasJoin) {
    hasUnsafeContext = true;
  }
  
  // Only proceed with auto-fix for simple queries
  if (!hasUnsafeContext) {
    // Simple case: Direct column references in SELECT and WHERE only
    // Example: SELECT total_tonnage FROM production_summary WHERE tonnage > 100
    
    for (const [invalid, valid] of Object.entries(corrections)) {
      // Use word boundary matching to avoid partial replacements
      const pattern = new RegExp(`\\b${invalid}\\b`, 'gi');
      
      if (pattern.test(fixedSql)) {
        fixedSql = fixedSql.replace(pattern, valid);
        changes.push(`Auto-fixed: '${invalid}' → '${valid}'`);
      }
    }
  } else {
    // Complex query - skip auto-fix, let error propagate for LLM retry
    return { sql, fixed: false, changes: [] };
  }
  
  const fixed = changes.length > 0;
  return { sql: fixedSql, fixed, changes };
}

// SQL Enhancer: Automatically add aliases to aggregation functions without them
function addMissingAliases(query: string): { sql: string; enhanced: boolean; additions: string[] } {
  // DISABLED: This function was incorrectly adding AS keywords inside nested functions
  // causing syntax errors like: ROUND(SUM(x) AS alias * 2) which is invalid
  // SQL Builder should explicitly add aliases where needed
  return { sql: query, enhanced: false, additions: [] };
  
  /* ORIGINAL CODE DISABLED
  let sql = query;
  const additions: string[] = [];
  let enhanced = false;

  // Pattern: Match aggregation functions without AS alias
  // Matches: SUM(column), AVG(column), COUNT(column), etc. that don't have AS alias_name after them
  // IMPORTANT: Skip window functions (those with OVER clause) - they already have the right syntax
  const aggregationPatterns = [
    {
      // SUM without alias (but not window functions with OVER)
      pattern: /\b(SUM)\s*\(\s*([^)]+)\s*\)(?!\s+(?:AS|OVER)\b)/gi,
      getAlias: (_match: string, _func: string, column: string) => {
        const cleanCol = column.trim().replace(/^[a-z_]+\./i, '').replace(/[^a-z0-9_]/gi, '_');
        return `total_${cleanCol}`;
      }
    },
    {
      // AVG without alias (but not window functions with OVER)
      pattern: /\b(AVG)\s*\(\s*([^)]+)\s*\)(?!\s+(?:AS|OVER)\b)/gi,
      getAlias: (_match: string, _func: string, column: string) => {
        const cleanCol = column.trim().replace(/^[a-z_]+\./i, '').replace(/[^a-z0-9_]/gi, '_');
        return `avg_${cleanCol}`;
      }
    },
    {
      // COUNT without alias (but not window functions with OVER)
      pattern: /\b(COUNT)\s*\(\s*([^)]+)\s*\)(?!\s+(?:AS|OVER)\b)/gi,
      getAlias: (_match: string, _func: string, column: string) => {
        const cleanCol = column.trim().replace(/^[a-z_]+\./i, '').replace(/[^a-z0-9_]/gi, '_');
        if (column.includes('DISTINCT')) {
          return `unique_${cleanCol.replace(/distinct_/i, '')}`;
        }
        return `count_${cleanCol}`;
      }
    },
    {
      // MAX without alias (but not window functions with OVER)
      pattern: /\b(MAX)\s*\(\s*([^)]+)\s*\)(?!\s+(?:AS|OVER)\b)/gi,
      getAlias: (_match: string, _func: string, column: string) => {
        const cleanCol = column.trim().replace(/^[a-z_]+\./i, '').replace(/[^a-z0-9_]/gi, '_');
        return `max_${cleanCol}`;
      }
    },
    {
      // MIN without alias (but not window functions with OVER)
      pattern: /\b(MIN)\s*\(\s*([^)]+)\s*\)(?!\s+(?:AS|OVER)\b)/gi,
      getAlias: (_match: string, _func: string, column: string) => {
        const cleanCol = column.trim().replace(/^[a-z_]+\./i, '').replace(/[^a-z0-9_]/gi, '_');
        return `min_${cleanCol}`;
      }
    },
    {
      // ROUND without alias (often used with aggregations) (but not window functions with OVER)
      pattern: /\b(ROUND)\s*\(\s*([^)]+)\s*,\s*\d+\s*\)(?!\s+(?:AS|OVER)\b)/gi,
      getAlias: (_match: string, _func: string, content: string) => {
        // Extract the inner function/column
        if (/SUM/i.test(content)) {
          const col = content.match(/SUM\s*\(\s*([^)]+)\s*\)/i)?.[1] || 'value';
          const cleanCol = col.trim().replace(/^[a-z_]+\./i, '').replace(/[^a-z0-9_]/gi, '_');
          return `total_${cleanCol}_rounded`;
        } else if (/AVG/i.test(content)) {
          const col = content.match(/AVG\s*\(\s*([^)]+)\s*\)/i)?.[1] || 'value';
          const cleanCol = col.trim().replace(/^[a-z_]+\./i, '').replace(/[^a-z0-9_]/gi, '_');
          return `avg_${cleanCol}_rounded`;
        } else {
          const cleanContent = content.trim().replace(/^[a-z_]+\./i, '').replace(/[^a-z0-9_]/gi, '_');
          return `${cleanContent}_rounded`;
        }
      }
    }
  ];

  for (const { pattern, getAlias } of aggregationPatterns) {
    // Reset pattern lastIndex for global regex
    pattern.lastIndex = 0;
    
    const matches = [...sql.matchAll(pattern)];
    if (matches.length > 0) {
      // Process matches in reverse order to maintain positions
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const fullMatch = match[0];
        const func = match[1];
        const content = match[2];
        
        // Skip if this is inside an OVER clause (window function - aliases come after)
        const afterMatch = sql.substring((match.index || 0) + fullMatch.length, (match.index || 0) + fullMatch.length + 20);
        if (/OVER\s*\($/.test(afterMatch)) {
          continue; // Window function, will handle separately
        }
        
        const alias = getAlias(fullMatch, func, content);
        const enhancedReplacement = `${fullMatch} AS ${alias}`;
        
        sql = sql.substring(0, match.index) + enhancedReplacement + sql.substring((match.index || 0) + fullMatch.length);
        
        additions.push(`Added alias '${alias}' to ${func}(${content.trim()})`);
        enhanced = true;
      }
    }
  }

  return { sql: sql.trim(), enhanced, additions };
  */
}

// SQL Fixer: Fix unqualified column names in JOIN queries to prevent ambiguous column errors
function fixAmbiguousColumns(query: string): { sql: string; fixed: boolean; issues: string[] } {
  let sql = query;
  const issues: string[] = [];
  let fixed = false;

  // Only process if query contains JOIN
  if (!/\bJOIN\b/i.test(sql)) {
    return { sql, fixed, issues };
  }

  // Define ambiguous columns and their default prefix (use 'p' for production_summary)
  const ambiguousColumns = [
    { column: 'shift', prefix: 'p' },
    { column: 'date', prefix: 'p' },
    { column: 'id', prefix: 'p' },
    { column: 'user_id', prefix: 'p' }
  ];

  for (const { column, prefix } of ambiguousColumns) {
    // Pattern: Match standalone column name that's NOT already qualified
    // Negative lookbehind: (?<!\w\.) ensures no word.column before
    // Negative lookahead: (?!\s*\.) ensures no .something after
    // Word boundaries: \b ensures exact word match
    const pattern = new RegExp(`(?<!\\w\\.)\\b${column}\\b(?!\\s*\\.)`, 'gi');
    
    if (pattern.test(sql)) {
      // Replace unqualified column with prefixed version
      sql = sql.replace(pattern, `${prefix}.${column}`);
      issues.push(`Added table prefix to ambiguous column '${column}' → '${prefix}.${column}'`);
      fixed = true;
    }
  }

  // Clean up: remove extra spaces and trailing semicolons
  sql = sql.replace(/\s+/g, ' ').trim();
  sql = sql.replace(/;+$/, '');

  return { sql, fixed, issues };
}

export async function executeSQL(query: string, useCache: boolean = true): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
  cached?: boolean;
  tokensUsed?: number;
}> {
  // Step 0: Normalize table name case (PostgreSQL case sensitivity fix)
  const normalizedQuery = normalizeTableReferences(query);
  
  if (normalizedQuery !== query) {
    console.warn('[Table Normalizer] Fixed table name case sensitivity:');
    console.warn('[Table Normalizer] Before:', query);
    console.warn('[Table Normalizer] After:', normalizedQuery);
  }

  // Step 1: Validate and fix bogus patterns
  const { sql: fixedQuery, fixed, issues, corrections } = detectAndFixBogusFilters(normalizedQuery);
  
  // Check for schema validation errors that couldn't be fixed
  // IMPORTANT: Only treat "doesn't exist" as error if there's NO correction available
  // If corrections exist, the issue is auto-fixable (either already fixed or will be via table aliases)
  const schemaErrors = issues.filter(issue => {
    // Always treat SCHEMA_ERROR prefix as error
    if (issue.startsWith('SCHEMA_ERROR:')) return true;
    
    // For "doesn't exist" messages, check if we have a correction
    if (issue.includes("doesn't exist")) {
      // Extract column name from message: "Column 'trip_date' doesn't exist..."
      const match = issue.match(/Column '(\w+)' doesn't exist/);
      if (match) {
        const columnName = match[1].toLowerCase();
        // If we have a correction for this column, it's auto-fixable - NOT an error
        if (corrections && corrections[columnName]) {
          return false; // Not an error, we have a correction
        }
      }
      return true; // No correction available - this is an error
    }
    
    return false;
  });
  
  if (schemaErrors.length > 0) {
    const errorMsg = schemaErrors.join(' ');
    console.error('[SQL Validator] Schema validation failed:', errorMsg);
    return { 
      success: false, 
      error: `Schema validation failed: ${errorMsg}` 
    };
  }
  
  if (fixed) {
    console.warn('[SQL Validator] Detected and fixed anti-patterns:', issues);
    console.warn('[SQL Validator] Original:', normalizedQuery);
    console.warn('[SQL Validator] Fixed:', fixedQuery);
  }

  // Step 2: Add missing aliases to aggregation functions
  const { sql: enhancedQuery, enhanced, additions } = addMissingAliases(fixedQuery);
  
  if (enhanced) {
    console.warn('[SQL Enhancer] Added missing aliases to aggregation functions:', additions);
    console.warn('[SQL Enhancer] Before:', fixedQuery);
    console.warn('[SQL Enhancer] After:', enhancedQuery);
  }

  // Step 3: Fix ambiguous column references in JOIN queries
  const { sql: finalQuery, fixed: ambiguousFixed, issues: ambiguousIssues } = fixAmbiguousColumns(enhancedQuery);
  
  if (ambiguousFixed) {
    console.warn('[SQL Fixer] Fixed ambiguous columns in JOIN query:', ambiguousIssues);
    console.warn('[SQL Fixer] Before:', enhancedQuery);
    console.warn('[SQL Fixer] After:', finalQuery);
  }

  const validation = validateSQLQuery(finalQuery);

  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const sanitized = validation.sanitized!;
  const queryHash = hashQuery(sanitized);

  if (useCache) {
    const { data: cached } = await supabase
      .from('sql_cache')
      .select('result, id')
      .eq('query_hash', queryHash)
      .maybeSingle();

    if (cached) {
      
      await supabase
        .from('sql_cache')
        .update({
          accessed_at: new Date().toISOString(),
          hit_count: supabase.rpc('increment', { row_id: cached.id })
        })
        .eq('id', cached.id);

      // Parse cached result if it's a JSON string
      const cachedData = typeof cached.result === 'string' 
        ? JSON.parse(cached.result) 
        : Array.isArray(cached.result) 
          ? cached.result 
          : [];

      return {
        success: true,
        data: cachedData,
        cached: true,
        tokensUsed: 0
      };
    }
  }

  try {
    // Use circuit breaker and retry logic for database queries
    const result = await databaseCircuitBreaker.execute(async () => {
      return await retryWithBackoff(
        async () => {
          const { data, error } = await supabase.rpc('execute_safe_sql', { query_text: sanitized });

          if (error) {
            throw new Error(`Database query failed: ${error.message}`);
          }

          // execute_safe_sql returns JSON string in some cases, need to parse it
          if (typeof data === 'string') {
            return JSON.parse(data);
          }
          
          // If data is already an array, return it; otherwise return empty array
          return Array.isArray(data) ? data : [];
        },
        {
          operation: 'Database Query',
          query: sanitized.substring(0, 100) + '...',
          step: 'execute_sql'
        },
        {
          maxAttempts: 3,
          initialDelay: 500,
          timeout: 15000
        }
      );
    });

    if (useCache) {
      // Use upsert to handle duplicates (update existing cache entry)
      supabase.from('sql_cache')
        .upsert({
          query_hash: queryHash,
          query: sanitized,
          result: result,
          accessed_at: new Date().toISOString()
        }, {
          onConflict: 'query_hash'
        })
        .then(({ error }) => {
          if (error) {
            console.warn('[Database] Failed to cache query result:', error.message);
          }
        });
    }

    return {
      success: true,
      data: result,
      cached: false,
      tokensUsed: estimateTokens(JSON.stringify(result))
    };
  } catch (err: any) {
    const errorMessage = err.message || String(err);
    console.error('[Database] Query execution error:', errorMessage);
    
    // Provide helpful error message
    if (errorMessage.includes('Circuit breaker is open')) {
      return { 
        success: false, 
        error: 'Database service is temporarily unavailable due to repeated failures. Please try again in a moment.' 
      };
    } else if (errorMessage.includes('timed out')) {
      return { 
        success: false, 
        error: 'Database query timed out after 15 seconds. The query may be too complex. Try simplifying your request.' 
      };
    } else {
      return { 
        success: false, 
        error: `Query execution failed: ${errorMessage}` 
      };
    }
  }
}

export async function discoverSchema(): Promise<{
  tables: Array<{ name: string; columns: Array<{ name: string; type: string }> }>;
}> {
  const { data: tables, error } = await supabase
    .rpc('get_schema_info');

  if (error) {
    console.error('Schema discovery failed:', error);
    return { tables: [] };
  }

  return { tables: tables || [] };
}

export async function getUserSettings(userId: string): Promise<RAGSettings | null> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('rag_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
      3000 // 3 second timeout
    ) as { data: any; error: any };

    if (error) {
      console.error('Failed to load settings:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('User settings timeout or error:', error);
    return null;
  }
}

export async function saveUserSettings(settings: Partial<RAGSettings> & { user_id: string }): Promise<boolean> {
  const { error } = await supabase
    .from('rag_settings')
    .upsert(settings, { onConflict: 'user_id' });

  if (error) {
    console.error('Failed to save settings:', error);
    return false;
  }

  return true;
}

export async function saveChatMessage(message: Omit<ChatMessage, 'id' | 'created_at'>): Promise<string | null> {
  const { data, error } = await supabase
    .from('chat_history')
    .insert(message)
    .select('id')
    .single();

  if (error) {
    console.error('Failed to save chat message:', error);
    return null;
  }

  return data.id;
}

// Timeout wrapper for Supabase queries to prevent hanging
async function withTimeout<T>(
  promiseOrThenable: Promise<T> | PromiseLike<T>, 
  timeoutMs: number = 3000
): Promise<T> {
  const promise = Promise.resolve(promiseOrThenable);
  const timeoutPromise = new Promise<T>((_, reject) => 
    setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs)
  );
  return Promise.race([promise, timeoutPromise]);
}

export async function getChatHistory(userId: string, limit: number = 50): Promise<ChatMessage[]> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('chat_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(limit),
      3000 // 3 second timeout
    );

    if (error) {
      console.error('Failed to load chat history:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Chat history timeout or error:', error);
    return [];
  }
}

export async function clearChatHistory(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('chat_history')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to clear chat history:', error);
    return false;
  }

  return true;
}

export async function getUserFiles(userId: string): Promise<UploadedFile[]> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('uploaded_files')
        .select('*')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false }),
      3000 // 3 second timeout
    ) as { data: any; error: any };

    if (error) {
      console.error('Failed to load files:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('User files timeout or error:', error);
    return [];
  }
}

export async function updateFileStatus(
  fileId: string,
  status: string,
  progress: number,
  docCount?: number,
  errorMessage?: string
): Promise<boolean> {
  const updates: any = { status, progress };

  if (docCount !== undefined) updates.doc_count = docCount;
  if (errorMessage) updates.error_message = errorMessage;
  if (status === 'ready') updates.indexed_at = new Date().toISOString();

  const { error } = await supabase
    .from('uploaded_files')
    .update(updates)
    .eq('id', fileId);

  if (error) {
    console.error('Failed to update file status:', error);
    return false;
  }

  return true;
}

export async function logDiagnostic(entry: Omit<DiagnosticEntry, 'id' | 'created_at'>): Promise<void> {
  await supabase.from('diagnostics').insert(entry);
}

export async function getDiagnostics(userId: string, limit: number = 100): Promise<DiagnosticEntry[]> {
  const { data, error } = await supabase
    .from('diagnostics')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to load diagnostics:', error);
    return [];
  }

  return data || [];
}

export async function clearAllIndexes(userId: string): Promise<boolean> {
  // First, get all file IDs for this user
  const { data: userFiles } = await supabase
    .from('uploaded_files')
    .select('id')
    .eq('user_id', userId);

  const fileIds = userFiles?.map(f => f.id) || [];

  if (fileIds.length > 0) {
    const { error: chunksError } = await supabase
      .from('rag_chunks')
      .delete()
      .in('file_id', fileIds);

    if (chunksError) {
      console.error('Failed to clear chunks:', chunksError);
      return false;
    }
  }

  const { error: filesError } = await supabase
    .from('uploaded_files')
    .update({ status: 'pending', progress: 0, doc_count: 0, indexed_at: null })
    .eq('user_id', userId);

  if (filesError) {
    console.error('Failed to reset files:', filesError);
    return false;
  }

  return true;
}
