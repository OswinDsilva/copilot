// Test the HYBRID approach: Schema validation + safe auto-fix

function validateAgainstSchema(sql) {
  const invalidColumns = [];
  const suggestions = [];
  const corrections = {};
  
  const tableSchemas = {
    'production_summary': [
      'id', 'date', 'shift', 'location', 'material', 'excavator',
      'loader', 'truck', 'qty_ton', 'qty_m3', 'total_trips',
      'avg_cycle_time', 'idle_time', 'weather', 'notes', 'created_at'
    ],
    'trip_summary_by_date': [
      'id', 'trip_date', 'total_trips', 'avg_haul_time', 'avg_queue_time',
      'avg_spot_time', 'avg_return_time', 'total_tonnage', 'equipment_utilization',
      'created_at', 'updated_at'
    ]
  };
  
  const commonMistakes = {
    'total_tonnage': 'qty_ton',
    'tonnage': 'qty_ton',
    'production_tons': 'qty_ton',
    'volume_m3': 'qty_m3',
    'trips': 'total_trips',
    'production_qty': 'qty_ton',
    'equipment_count': 'excavator'
  };
  
  const SQL_KEYWORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
    'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL',
    'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'ASC', 'DESC',
    'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'DISTINCT', 'CASE', 'WHEN', 'THEN',
    'ELSE', 'END', 'CAST', 'EXTRACT', 'DATE', 'TIMESTAMP', 'INTERVAL',
    'COALESCE', 'NULLIF', 'OVER', 'PARTITION', 'WINDOW', 'ROW_NUMBER'
  ]);
  
  const tableMatch = sql.match(/FROM\s+(\w+)/i);
  if (!tableMatch) {
    return { invalidColumns, suggestions, corrections };
  }
  
  const tableName = tableMatch[1].toLowerCase();
  const validColumns = tableSchemas[tableName];
  
  if (!validColumns) {
    return { invalidColumns, suggestions, corrections };
  }
  
  const tokens = sql.match(/\b\w+\b/g) || [];
  const reported = new Set();
  
  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    
    if (SQL_KEYWORDS.has(token.toUpperCase())) continue;
    if (Object.keys(tableSchemas).includes(lowerToken)) continue;
    if (validColumns.includes(lowerToken)) continue;
    if (/^\d+$/.test(token)) continue;
    
    if (commonMistakes[lowerToken] && !reported.has(lowerToken)) {
      invalidColumns.push(token);
      corrections[lowerToken] = commonMistakes[lowerToken];
      suggestions.push(
        `Column '${token}' doesn't exist in ${tableName}. Did you mean '${commonMistakes[lowerToken]}'?`
      );
      reported.add(lowerToken);
    }
  }
  
  return { invalidColumns, suggestions, corrections };
}

function safeAutoFixColumns(sql, corrections) {
  let fixedSql = sql;
  const changes = [];
  let hasUnsafeContext = false;
  
  // Safety checks
  const hasAsAliases = /\bAS\s+\w+/i.test(sql);
  const hasGroupBy = /\bGROUP\s+BY\b/i.test(sql);
  const hasOrderBy = /\bORDER\s+BY\b/i.test(sql);
  const hasFunctions = /\b(COALESCE|CAST|EXTRACT|CASE|NULLIF)\s*\(/i.test(sql);
  const hasJoin = /\bJOIN\b/i.test(sql);
  
  if (hasAsAliases || hasGroupBy || hasOrderBy || hasFunctions || hasJoin) {
    hasUnsafeContext = true;
  }
  
  if (!hasUnsafeContext) {
    for (const [invalid, valid] of Object.entries(corrections)) {
      const pattern = new RegExp(`\\b${invalid}\\b`, 'gi');
      
      if (pattern.test(fixedSql)) {
        fixedSql = fixedSql.replace(pattern, valid);
        changes.push(`Auto-fixed: '${invalid}' → '${valid}'`);
      }
    }
  } else {
    return { sql, fixed: false, changes: [] };
  }
  
  const fixed = changes.length > 0;
  return { sql: fixedSql, fixed, changes };
}

function detectAndFixBogusFilters(sql) {
  let fixed = false;
  const issues = [];
  
  const schemaValidation = validateAgainstSchema(sql);
  if (schemaValidation.invalidColumns.length > 0) {
    const autoFixResult = safeAutoFixColumns(sql, schemaValidation.corrections);
    
    if (autoFixResult.fixed) {
      sql = autoFixResult.sql;
      fixed = true;
      issues.push(...autoFixResult.changes);
    } else {
      issues.push(...schemaValidation.suggestions);
    }
  }
  
  return { sql: sql.trim(), fixed, issues };
}

// Test cases
const tests = [
  {
    name: 'SIMPLE: SELECT invented column (SHOULD AUTO-FIX)',
    input: 'SELECT total_tonnage FROM production_summary',
    expected: 'SELECT qty_ton FROM production_summary',
    shouldAutoFix: true
  },
  {
    name: 'SIMPLE: WHERE invented column (SHOULD AUTO-FIX)',
    input: 'SELECT * FROM production_summary WHERE tonnage > 100',
    expected: 'SELECT * FROM production_summary WHERE qty_ton > 100',
    shouldAutoFix: true
  },
  {
    name: 'SIMPLE: Multiple invented columns (SHOULD AUTO-FIX)',
    input: 'SELECT total_tonnage, trips FROM production_summary WHERE volume_m3 > 50',
    expected: 'SELECT qty_ton, total_trips FROM production_summary WHERE qty_m3 > 50',
    shouldAutoFix: true
  },
  {
    name: 'COMPLEX: AS alias (SKIP AUTO-FIX)',
    input: 'SELECT total_tonnage AS qty_ton FROM production_summary',
    expected: 'SELECT total_tonnage AS qty_ton FROM production_summary',
    shouldAutoFix: false
  },
  {
    name: 'COMPLEX: GROUP BY (SKIP AUTO-FIX)',
    input: 'SELECT equipment_count, COUNT(*) FROM production_summary GROUP BY equipment_count',
    expected: 'SELECT equipment_count, COUNT(*) FROM production_summary GROUP BY equipment_count',
    shouldAutoFix: false
  },
  {
    name: 'COMPLEX: ORDER BY (SKIP AUTO-FIX)',
    input: 'SELECT SUM(qty_ton) AS total_tonnage FROM production_summary ORDER BY total_tonnage',
    expected: 'SELECT SUM(qty_ton) AS total_tonnage FROM production_summary ORDER BY total_tonnage',
    shouldAutoFix: false
  },
  {
    name: 'COMPLEX: Function call (SKIP AUTO-FIX)',
    input: 'SELECT COALESCE(total_tonnage, 0) FROM production_summary',
    expected: 'SELECT COALESCE(total_tonnage, 0) FROM production_summary',
    shouldAutoFix: false
  },
  {
    name: 'COMPLEX: JOIN (SKIP AUTO-FIX)',
    input: 'SELECT p.total_tonnage, t.tonnage FROM production_summary p JOIN trip_summary_by_date t ON p.date = t.trip_date',
    expected: 'SELECT p.total_tonnage, t.tonnage FROM production_summary p JOIN trip_summary_by_date t ON p.date = t.trip_date',
    shouldAutoFix: false
  },
  {
    name: 'VALID: No invented columns',
    input: 'SELECT qty_ton, total_trips FROM production_summary WHERE qty_m3 > 100',
    expected: 'SELECT qty_ton, total_trips FROM production_summary WHERE qty_m3 > 100',
    shouldAutoFix: false
  }
];

console.log('=== HYBRID APPROACH TESTS ===\n');

let passed = 0;
let failed = 0;

tests.forEach(test => {
  const result = detectAndFixBogusFilters(test.input);
  const sqlMatches = result.sql === test.expected;
  const fixedMatches = result.fixed === test.shouldAutoFix;
  const pass = sqlMatches && fixedMatches;
  
  if (pass) {
    console.log(`✅ PASS: ${test.name}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${test.name}`);
    if (!sqlMatches) {
      console.log(`  Expected SQL: ${test.expected}`);
      console.log(`  Got SQL:      ${result.sql}`);
    }
    if (!fixedMatches) {
      console.log(`  Expected fixed=${test.shouldAutoFix}, got fixed=${result.fixed}`);
    }
    failed++;
  }
  
  if (result.issues.length > 0) {
    console.log(`  Issues: ${result.issues.join(', ')}`);
  }
  console.log('');
});

console.log('=== RESULTS ===');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Total: ${tests.length}\n`);

console.log('=== SUMMARY ===');
const autoFixed = tests.filter(t => t.shouldAutoFix).length;
const skipped = tests.filter(t => !t.shouldAutoFix && tests.indexOf(t) < tests.length - 1).length;
console.log(`Auto-fixed (simple): ${autoFixed} queries`);
console.log(`Skipped (complex): ${skipped} queries - error will propagate for LLM retry`);

if (failed > 0) {
  process.exit(1);
}
