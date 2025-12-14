import { StatisticalQueryTemplate } from '../../types';
import { monthNumberToName } from '../helpers/joinRules';

/**
 * Adapter for sqlBuilder: builds SQL for STATISTICAL_QUERY intent
 */
export function buildStatisticalSQL(params: Record<string, any>, question: string): string | null {
  console.log('[Statistical SQL Builder] ========================================');
  console.log('[Statistical SQL Builder] buildStatisticalSQL ENTERED');
  console.log('[Statistical SQL Builder] params:', JSON.stringify(params, null, 2));
  console.log('[Statistical SQL Builder] question:', question);
  
  // Expect params.statisticalTemplate to be present
  const template: StatisticalQueryTemplate | undefined = params.statisticalTemplate;
  console.log('[Statistical SQL Builder] template extracted:', JSON.stringify(template, null, 2));
  
  if (!template) {
    console.log('[Statistical SQL Builder] NO TEMPLATE FOUND - RETURNING NULL');
    return null;
  }
  
  // Default table for production stats
  const table = 'production_summary';
  // Optionally extract year from params
  const year = params.year || (params.parsed_date && params.parsed_date.year);
  console.log('[Statistical SQL Builder] Calling buildStatisticalQuery with:', { table, year });
  
  const sql = buildStatisticalQuery(table, template, year, question);
  console.log('[Statistical SQL Builder] Generated SQL:', sql);
  console.log('[Statistical SQL Builder] ========================================');
  return sql;
}

/**
 * Improved SQL builder for statistical queries:
 * Handles:
 *  - mean, median, mode, stddev
 *  - "statistical analysis" (auto-expands to all ops)
 *  - month filters
 *  - "total production" (maps to qty_ton)
 *  - "which month has highest deviation"
 */
export function buildStatisticalQuery(
  table: string,
  template: StatisticalQueryTemplate,
  year?: number,
  question?: string
): string {
  console.log('[Statistical SQL Builder] buildStatisticalQuery called', { table, template, year, question });

  const operations = normalizeOperations(template.operations, question);
  const targetColumn = normalizeTargetColumn(template.targetColumn, question);
  const { groupBy, filters, queryType, selectMonthName, orderBy } = template;

  const selectClauses: string[] = [];

  // Add month identifier to SELECT if needed
  if (selectMonthName && groupBy) {
    selectClauses.push(`EXTRACT(MONTH FROM date) AS month_number`);
    selectClauses.push(`${monthNumberToName('EXTRACT(MONTH FROM date)')} AS month_name`);
  }

  // Build statistical SELECT expressions
  for (const op of operations) {
    if (op === 'mean') {
      selectClauses.push(`ROUND(AVG(${targetColumn})::numeric, 2) AS mean_${targetColumn}`);
    } else if (op === 'median') {
      selectClauses.push(`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${targetColumn}) AS median_${targetColumn}`);
    } else if (op === 'mode') {
      selectClauses.push(`MODE() WITHIN GROUP (ORDER BY ${targetColumn}) AS mode_${targetColumn}`);
    } else if (op === 'stddev') {
      selectClauses.push(`ROUND(STDDEV_POP(${targetColumn})::numeric, 2) AS stddev_${targetColumn}`);
    }
  }

  let sql = `SELECT ${selectClauses.join(', ')} FROM ${table}`;

  const whereClauses: string[] = [];

  // Year filter
  if (year) {
    whereClauses.push(`EXTRACT(YEAR FROM date) = ${year}`);
  }

  // Multi-month filter (array of months)
  if (filters?.months && Array.isArray(filters.months)) {
    whereClauses.push(`EXTRACT(MONTH FROM date) IN (${filters.months.join(', ')})`);
  } 
  // Single month filter
  else if (filters?.month) {
    whereClauses.push(`EXTRACT(MONTH FROM date) = ${Number(filters.month)}`);
  }

  // All other filters (equipment, shift, etc.)
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (key === 'month' || key === 'months') continue;
      whereClauses.push(`${key} = '${value}'`);
    }
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  // Add GROUP BY if specified
  if (groupBy) {
    sql += ` GROUP BY ${groupBy}`;
  }

  // Add ORDER BY based on query type
  if (queryType === 'ranking' && orderBy === 'detect_from_question' && question) {
    const orderByClause = detectOrderBy(question, targetColumn, operations);
    if (orderByClause) {
      sql += ` ${orderByClause}`;
    }
  } else if (queryType === 'chart' || queryType === 'multi_month') {
    // For charts and multi-month, order by month number
    sql += ` ORDER BY month_number`;
  }

  return sql;
}

/**
 * Detect ORDER BY clause from question text
 * Handles patterns like "highest mean", "lowest stddev", "maximum deviation"
 */
function detectOrderBy(question: string, targetColumn: string, operations: string[]): string | null {
  const lowerQ = question.toLowerCase();
  
  // Detect direction
  const isDescending = /\b(highest|maximum|biggest|greatest|most|top)\b/i.test(lowerQ);
  const isAscending = /\b(lowest|minimum|smallest|least|bottom)\b/i.test(lowerQ);
  
  if (!isDescending && !isAscending) return null;
  
  const direction = isDescending ? 'DESC' : 'ASC';
  
  // Detect which statistic to order by
  let orderColumn: string | null = null;
  
  if (/\b(mean|average)\b/i.test(lowerQ) && operations.includes('mean')) {
    orderColumn = `mean_${targetColumn}`;
  } else if (/\bmedian\b/i.test(lowerQ) && operations.includes('median')) {
    orderColumn = `median_${targetColumn}`;
  } else if (/\bmode\b/i.test(lowerQ) && operations.includes('mode')) {
    orderColumn = `mode_${targetColumn}`;
  } else if (/\b(stddev|deviation|standard deviation)\b/i.test(lowerQ) && operations.includes('stddev')) {
    orderColumn = `stddev_${targetColumn}`;
  } else if (operations.length > 0) {
    // Default to first operation if no specific mention
    orderColumn = `${operations[0]}_${targetColumn}`;
  }
  
  if (!orderColumn) return null;
  
  return `ORDER BY ${orderColumn} ${direction} LIMIT 1`;
}

/**
 * Map phrases like "total production" → qty_ton
 */
function normalizeTargetColumn(col: string | undefined, question?: string): string {
  if (!col && question) {
    if (/\btotal production\b/i.test(question)) return 'qty_ton';
    if (/\bproduction\b/i.test(question)) return 'qty_ton';
  }
  return col || 'qty_ton';
}

/**
 * Expand "statistical analysis" → all ops
 */
function normalizeOperations(ops: string[], question?: string): string[] {
  const hasStatAnalysis =
    question && /\b(statistical analysis|calculate all|compute all|full stats)\b/i.test(question);

  if (hasStatAnalysis) {
    return ['mean', 'median', 'mode', 'stddev'];
  }

  // Also if question lists them explicitly
  if (question && /\b(mean|median|mode|stddev|deviation)\b/i.test(question)) {
    const detected: string[] = [];
    if (/mean/i.test(question)) detected.push('mean');
    if (/median/i.test(question)) detected.push('median');
    if (/mode/i.test(question)) detected.push('mode');
    if (/stddev|deviation|standard deviation/i.test(question)) detected.push('stddev');
    return detected.length > 0 ? detected : ops;
  }

  return ops;
}


