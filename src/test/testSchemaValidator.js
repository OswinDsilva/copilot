// Test the NEW schema-based validator (no auto-fixing, just warnings)

function validateAgainstSchema(sql) {
  const invalidColumns = [];
  const suggestions = [];
  
  // Define table schemas
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
  
  // Common column name mistakes and their corrections
  const commonMistakes = {
    'total_tonnage': 'qty_ton',
    'tonnage': 'qty_ton',
    'production_tons': 'qty_ton',
    'volume_m3': 'qty_m3',
    'trips': 'total_trips',
    'production_qty': 'qty_ton',
    'equipment_count': 'excavator'
  };
  
  // SQL keywords to ignore
  const SQL_KEYWORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
    'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL',
    'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'ASC', 'DESC',
    'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'DISTINCT', 'CASE', 'WHEN', 'THEN',
    'ELSE', 'END', 'CAST', 'EXTRACT', 'DATE', 'TIMESTAMP', 'INTERVAL',
    'COALESCE', 'NULLIF', 'OVER', 'PARTITION', 'WINDOW', 'ROW_NUMBER'
  ]);
  
  // Extract table name from SQL
  const tableMatch = sql.match(/FROM\s+(\w+)/i);
  if (!tableMatch) {
    return { invalidColumns, suggestions };
  }
  
  const tableName = tableMatch[1].toLowerCase();
  const validColumns = tableSchemas[tableName];
  
  if (!validColumns) {
    // Unknown table, can't validate
    return { invalidColumns, suggestions };
  }
  
  // Extract all word tokens from SQL (potential column names)
  const tokens = sql.match(/\b\w+\b/g) || [];
  
  // Check each token
  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    
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
    
    // Check if it's a common mistake
    if (commonMistakes[lowerToken]) {
      if (!invalidColumns.includes(token)) {
        invalidColumns.push(token);
        suggestions.push(
          `Column '${token}' doesn't exist in ${tableName}. Did you mean '${commonMistakes[lowerToken]}'?`
        );
      }
    }
  }
  
  return { invalidColumns, suggestions };
}

// Test cases
const tests = [
  {
    name: 'Invented column: total_tonnage',
    sql: 'SELECT total_tonnage FROM production_summary',
    expectWarning: true
  },
  {
    name: 'Invented column in WHERE',
    sql: 'SELECT * FROM production_summary WHERE tonnage > 100',
    expectWarning: true
  },
  {
    name: 'Multiple invented columns',
    sql: 'SELECT total_tonnage, trips, volume_m3 FROM production_summary',
    expectWarning: true
  },
  {
    name: 'Valid columns only',
    sql: 'SELECT qty_ton, total_trips, qty_m3 FROM production_summary',
    expectWarning: false
  },
  {
    name: 'JOIN with table prefix',
    sql: 'SELECT p.total_tonnage, t.tonnage FROM production_summary p JOIN trip_summary_by_date t ON p.date = t.trip_date',
    expectWarning: true // Should warn about total_tonnage in production_summary
  },
  {
    name: 'AS alias (should still warn about source column)',
    sql: 'SELECT total_tonnage AS qty_ton FROM production_summary',
    expectWarning: true // Warns about total_tonnage being used
  }
];

console.log('=== SCHEMA VALIDATOR TESTS ===\n');

let passed = 0;
let failed = 0;

tests.forEach(test => {
  const result = validateAgainstSchema(test.sql);
  const hasWarnings = result.invalidColumns.length > 0;
  const pass = hasWarnings === test.expectWarning;
  
  if (pass) {
    console.log(`✅ PASS: ${test.name}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${test.name}`);
    console.log(`  Expected warning: ${test.expectWarning}`);
    console.log(`  Got warnings: ${hasWarnings}`);
    failed++;
  }
  
  if (result.suggestions.length > 0) {
    console.log(`  Suggestions:`);
    result.suggestions.forEach(s => console.log(`    - ${s}`));
  }
  console.log('');
});

console.log('=== RESULTS ===');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Total: ${tests.length}`);

if (failed > 0) {
  process.exit(1);
}
