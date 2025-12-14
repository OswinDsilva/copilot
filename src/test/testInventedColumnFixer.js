/**
 * Comprehensive test suite for the invented column name fixer
 * Tests all edge cases: AS aliases, ORDER BY, WHERE, GROUP BY, etc.
 */

// Simulate the invented column fixer function
function detectAndFixBogusFilters(sql) {
  const issues = [];
  let fixed = false;
  
  if (/FROM\s+production_summary/i.test(sql)) {
    const invalidColumns = [
      'total_tonnage', 'tonnage', 'production_tons', 'volume_m3', 
      'trips', 'production_qty', 'equipment_count'
    ];
    
    for (const col of invalidColumns) {
      // Only match if:
      // 1. NOT preceded by "AS " - it's an alias
      // 2. NOT preceded by "BY " - likely an alias reference in ORDER BY
      const pattern = new RegExp(`(?<!AS\\s)(?<!BY\\s)\\b${col}\\b(?!\\s*\\))`, 'gi');
      
      const matches = [...sql.matchAll(pattern)];
      if (matches.length > 0) {
        const replacements = {
          'total_tonnage': 'qty_ton',
          'tonnage': 'qty_ton',
          'production_tons': 'qty_ton',
          'volume_m3': 'qty_m3',
          'trips': 'total_trips',
          'production_qty': 'qty_ton',
          'equipment_count': 'excavator'
        };
        
        const correctCol = replacements[col.toLowerCase()] || 'qty_ton';
        sql = sql.replace(pattern, correctCol);
        issues.push(`Replaced invented column '${col}' with actual column '${correctCol}'`);
        fixed = true;
      }
    }
  }
  
  return { sql: sql.trim(), fixed, issues };
}

// Test runner
let passCount = 0;
let failCount = 0;

function test(name, input, expected, shouldFix = false) {
  const result = detectAndFixBogusFilters(input);
  const passed = result.sql === expected && result.fixed === shouldFix;
  
  if (passed) {
    console.log(`✅ PASS: ${name}`);
    passCount++;
  } else {
    console.log(`❌ FAIL: ${name}`);
    console.log(`  Input:    ${input}`);
    console.log(`  Expected: ${expected} (fixed=${shouldFix})`);
    console.log(`  Got:      ${result.sql} (fixed=${result.fixed})`);
    if (result.issues.length > 0) {
      console.log(`  Issues:   ${result.issues.join(', ')}`);
    }
    failCount++;
  }
}

console.log('\n=== AS ALIAS TESTS (should NOT be replaced) ===\n');

test(
  'SELECT with AS alias',
  'SELECT SUM(qty_ton) AS total_tonnage FROM production_summary',
  'SELECT SUM(qty_ton) AS total_tonnage FROM production_summary',
  false
);

test(
  'Multiple AS aliases',
  'SELECT SUM(qty_ton) AS total_tonnage, AVG(qty_ton) AS avg_tonnage FROM production_summary',
  'SELECT SUM(qty_ton) AS total_tonnage, AVG(qty_ton) AS avg_tonnage FROM production_summary',
  false
);

test(
  'Window function with AS alias',
  'SELECT date, AVG(qty_ton) OVER () AS avg_tonnage FROM production_summary',
  'SELECT date, AVG(qty_ton) OVER () AS avg_tonnage FROM production_summary',
  false
);

console.log('\n=== ORDER BY TESTS (should NOT be replaced) ===\n');

test(
  'ORDER BY alias',
  'SELECT SUM(qty_ton) AS total_tonnage FROM production_summary GROUP BY shift ORDER BY total_tonnage DESC',
  'SELECT SUM(qty_ton) AS total_tonnage FROM production_summary GROUP BY shift ORDER BY total_tonnage DESC',
  false
);

test(
  'ORDER BY multiple aliases',
  'SELECT SUM(qty_ton) AS total_tonnage, COUNT(*) AS trips FROM production_summary GROUP BY shift ORDER BY total_tonnage DESC, trips ASC',
  'SELECT SUM(qty_ton) AS total_tonnage, COUNT(*) AS trips FROM production_summary GROUP BY shift ORDER BY total_tonnage DESC, trips ASC',
  false
);

test(
  'Complex query with AS and ORDER BY',
  'SELECT shift, SUM(qty_ton) AS total_tonnage, AVG(qty_ton) AS avg_tonnage FROM production_summary WHERE date BETWEEN "2025-01-01" AND "2025-01-31" GROUP BY shift ORDER BY total_tonnage DESC',
  'SELECT shift, SUM(qty_ton) AS total_tonnage, AVG(qty_ton) AS avg_tonnage FROM production_summary WHERE date BETWEEN "2025-01-01" AND "2025-01-31" GROUP BY shift ORDER BY total_tonnage DESC',
  false
);

console.log('\n=== WHERE CLAUSE TESTS (SHOULD be replaced) ===\n');

test(
  'WHERE with invented column',
  'SELECT * FROM production_summary WHERE total_tonnage > 100',
  'SELECT * FROM production_summary WHERE qty_ton > 100',
  true
);

test(
  'WHERE with multiple invented columns',
  'SELECT * FROM production_summary WHERE total_tonnage > 100 AND trips > 50',
  'SELECT * FROM production_summary WHERE qty_ton > 100 AND total_trips > 50',
  true
);

test(
  'WHERE with volume_m3',
  'SELECT * FROM production_summary WHERE volume_m3 > 1000',
  'SELECT * FROM production_summary WHERE qty_m3 > 1000',
  true
);

console.log('\n=== SELECT LIST TESTS (SHOULD be replaced) ===\n');

test(
  'SELECT invented column',
  'SELECT total_tonnage FROM production_summary',
  'SELECT qty_ton FROM production_summary',
  true
);

test(
  'SELECT multiple invented columns',
  'SELECT total_tonnage, trips, volume_m3 FROM production_summary',
  'SELECT qty_ton, total_trips, qty_m3 FROM production_summary',
  true
);

test(
  'SELECT with tonnage variant',
  'SELECT tonnage, production_tons FROM production_summary',
  'SELECT qty_ton, qty_ton FROM production_summary',
  true
);

console.log('\n=== MIXED TESTS (some replace, some preserve) ===\n');

test(
  'Mixed: SELECT invented + WHERE invented + AS alias',
  'SELECT total_tonnage, SUM(qty_ton) AS total_tonnage FROM production_summary WHERE tonnage > 100 GROUP BY shift',
  'SELECT qty_ton, SUM(qty_ton) AS total_tonnage FROM production_summary WHERE qty_ton > 100 GROUP BY shift',
  true
);

test(
  'Mixed: AS alias + ORDER BY alias + WHERE invented',
  'SELECT SUM(qty_ton) AS total_tonnage FROM production_summary WHERE tonnage > 100 GROUP BY shift ORDER BY total_tonnage DESC',
  'SELECT SUM(qty_ton) AS total_tonnage FROM production_summary WHERE qty_ton > 100 GROUP BY shift ORDER BY total_tonnage DESC',
  true
);

test(
  'Complex real-world query',
  'SELECT shift, SUM(qty_ton) AS total_tonnage, AVG(qty_ton) AS avg_tonnage, COUNT(DISTINCT date) AS production_days FROM production_summary WHERE date BETWEEN "2025-01-01" AND "2025-01-31" GROUP BY shift ORDER BY total_tonnage DESC',
  'SELECT shift, SUM(qty_ton) AS total_tonnage, AVG(qty_ton) AS avg_tonnage, COUNT(DISTINCT date) AS production_days FROM production_summary WHERE date BETWEEN "2025-01-01" AND "2025-01-31" GROUP BY shift ORDER BY total_tonnage DESC',
  false
);

console.log('\n=== GROUP BY TESTS (should NOT be replaced) ===\n');

test(
  'GROUP BY with column that could be mistaken',
  'SELECT equipment_count, COUNT(*) FROM production_summary GROUP BY equipment_count',
  'SELECT equipment_count, COUNT(*) FROM production_summary GROUP BY equipment_count',
  false
);

console.log('\n=== EDGE CASES ===\n');

test(
  'Inside function call (should NOT replace)',
  'SELECT COALESCE(total_tonnage, 0) AS total_tonnage FROM production_summary',
  'SELECT COALESCE(total_tonnage, 0) AS total_tonnage FROM production_summary',
  false
);

test(
  'Multiple AS in different contexts',
  'SELECT date AS production_date, SUM(qty_ton) AS total_tonnage FROM production_summary WHERE tonnage > 100 GROUP BY date ORDER BY total_tonnage DESC',
  'SELECT date AS production_date, SUM(qty_ton) AS total_tonnage FROM production_summary WHERE qty_ton > 100 GROUP BY date ORDER BY total_tonnage DESC',
  true
);

test(
  'All invented columns at once',
  'SELECT total_tonnage, tonnage, production_tons, volume_m3, trips, production_qty, equipment_count FROM production_summary',
  'SELECT qty_ton, qty_ton, qty_ton, qty_m3, total_trips, qty_ton, excavator FROM production_summary',
  true
);

console.log('\n=== QUERIES FROM OTHER TABLES (should NOT touch) ===\n');

test(
  'Different table - no changes',
  'SELECT total_tonnage FROM trip_summary_by_date WHERE tonnage > 100',
  'SELECT total_tonnage FROM trip_summary_by_date WHERE tonnage > 100',
  false
);

test(
  'JOIN with production_summary - should fix only production_summary references',
  'SELECT p.total_tonnage, t.tonnage FROM production_summary p JOIN trip_summary_by_date t ON p.date = t.trip_date WHERE p.tonnage > 100',
  'SELECT p.qty_ton, t.tonnage FROM production_summary p JOIN trip_summary_by_date t ON p.date = t.trip_date WHERE p.qty_ton > 100',
  true
);

console.log('\n=== RESULTS ===');
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log(`Total: ${passCount + failCount}`);

if (failCount === 0) {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
} else {
  console.log(`\n⚠️  ${failCount} test(s) failed`);
  process.exit(1);
}
