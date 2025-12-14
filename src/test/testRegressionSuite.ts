/**
 * Test to verify fixes don't break existing queries
 * Tests: 1) Monthly summary with shift filter, 2) Specific date parsing, 3) Equipment combination queries
 */

import { routeQuestion } from '../router/index.js';
import { buildSQL } from '../router/sqlBuilder.js';

async function testRegressionSuite() {
  const tests = [
    // EXISTING BEHAVIOR - Monthly summaries without shift
    {
      query: "Give me complete summary of January 2025",
      expectedIntent: "MONTHLY_SUMMARY",
      expectedSQL: /SELECT.*SUM\(qty_ton\).*WHERE EXTRACT\(MONTH FROM date\) = 1.*2025/s,
      shouldNotHave: /GROUP BY date|BETWEEN/,
      description: "Monthly summary without shift"
    },
    
    // NEW FIX - Monthly summary WITH shift filter (should include shift filter in WHERE clause)
    {
      query: "Give me complete summary of January 2025 for shift A",
      expectedIntent: "MONTHLY_SUMMARY",
      expectedSQL: /SELECT.*SUM\(qty_ton\).*WHERE EXTRACT\(MONTH FROM date\) = 1.*2025.*AND shift IN \('A'\)/s,
      shouldNotHave: /GROUP BY date|BETWEEN/,
      description: "Monthly summary with shift filter (NEW FIX)"
    },
    
    // EXISTING BEHAVIOR - Specific date queries
    {
      query: "Show production on January 15",
      expectedIntent: "DATA_RETRIEVAL",
      expectedSQL: /WHERE.*date.*=.*'2025-01-15'|trip_date.*=.*'2025-01-15'/,
      shouldNotHave: /EXTRACT\(MONTH/,
      description: "Specific date query (existing)"
    },
    
    // NEW FIX - Specific date with equipment type (should use trip_summary_by_date)
    {
      query: "Show production on January 15, 2025 shift A and which tippers contributed",
      expectedIntent: "EQUIPMENT_COMBINATION",
      expectedSQL: /SELECT.*tipper_id.*FROM trip_summary_by_date.*WHERE trip_date = '2025-01-15'.*AND shift IN \('A'\)/s,
      shouldNotHave: /FROM production_summary|BETWEEN/,
      description: "Specific date with equipment type (NEW FIX)"
    },
    
    // EXISTING BEHAVIOR - Equipment combinations (2+ equipment types)
    {
      query: "Show excavator and tipper pairs in January",
      expectedIntent: "EQUIPMENT_COMBINATION",
      expectedSQL: /SELECT.*tipper_id.*excavator.*FROM trip_summary_by_date/s,
      shouldNotHave: /FROM production_summary/,
      description: "Equipment combinations (existing)"
    },
    
    // EXISTING BEHAVIOR - Month-only parsing
    {
      query: "Show data for January 2025",
      expectedIntent: /MONTHLY_SUMMARY|DATA_RETRIEVAL|EQUIPMENT_SPECIFIC_PRODUCTION/,
      expectedSQL: /2025.*january|EXTRACT\(MONTH FROM.*= 1|date.*2025-01/i,
      shouldNotHave: null,
      description: "Month-only parsing (existing)"
    },
    
    // EXISTING BEHAVIOR - Date ranges
    {
      query: "Show production from January 1 to January 31 2025",
      expectedIntent: /.*/,
      expectedSQL: /BETWEEN|trip_date >= '2025-01-01'.*trip_date <= '2025-01-31'|date.*'2025-01-01'.*'2025-01-31'/s,
      shouldNotHave: null,
      description: "Date range parsing (existing)"
    },
    
    // EDGE CASE - Specific date formats (should now correctly identify as single date)
    {
      query: "15 January 2025 production",
      expectedIntent: /.*/,  // Accept any intent
      expectedSQL: /'2025-01-15'|null/,  // Either generates SQL with specific date OR null (then LLM handles it)
      shouldNotHave: /EXTRACT\(MONTH.*GROUP BY date/,  // Should NOT be monthly summary with GROUP BY
      description: "Alternative date format (15 January 2025)"
    }
  ];

  console.log('═══════════════════════════════════════════════════');
  console.log('  Regression Test Suite - Verify No Breaking Changes');
  console.log('═══════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const decision = await routeQuestion(test.query);
    const sql = buildSQL(decision.intent || 'DATA_RETRIEVAL', decision.parameters || {}, test.query);
    
    const intentMatch = typeof test.expectedIntent === 'string' 
      ? decision.intent === test.expectedIntent
      : test.expectedIntent.test(decision.intent || '');
    
    const sqlMatch = test.expectedSQL.test(sql || '');
    const noUnwantedSQL = !test.shouldNotHave || !test.shouldNotHave.test(sql || '');
    
    const allPass = intentMatch && sqlMatch && noUnwantedSQL;
    
    if (allPass) {
      console.log(`✅ ${test.description}`);
      console.log(`   Query: "${test.query}"`);
      console.log(`   Intent: ${decision.intent}`);
      console.log(`   SQL: ${sql?.substring(0, 100)}...`);
      console.log('');
      passed++;
    } else {
      console.log(`❌ ${test.description}`);
      console.log(`   Query: "${test.query}"`);
      console.log(`   Intent: ${decision.intent} (expected: ${test.expectedIntent})`);
      console.log(`   SQL: ${sql}`);
      if (!sqlMatch) console.log(`   ⚠️  SQL doesn't match expected pattern`);
      if (!noUnwantedSQL) console.log(`   ⚠️  SQL contains unwanted pattern: ${test.shouldNotHave}`);
      console.log('');
      failed++;
    }
  }

  console.log('═══════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════');
  
  if (failed > 0) {
    process.exit(1);
  }
}

testRegressionSuite().catch(console.error);
