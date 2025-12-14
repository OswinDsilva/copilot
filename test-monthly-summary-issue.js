/**
 * Test to debug MONTHLY_SUMMARY intent triggering incorrectly
 * 
 * Issue: Queries like "Plot QTY TON production for January 2025" 
 * are routing to MONTHLY_SUMMARY instead of CHART_VISUALIZATION
 */

import { normalizeUserQuery } from './src/router/services/intent.ts';

const testCases = [
  {
    query: "Plot QTY TON production for January 2025 with average line overlay",
    expectedIntent: "CHART_VISUALIZATION",
    shouldNotBe: "MONTHLY_SUMMARY",
    reason: "Has 'plot' keyword - should be chart visualization, not monthly summary"
  },
  {
    query: "What are the most used routes or faces in January 2025",
    expectedIntent: "ROUTES_FACES_ANALYSIS",
    shouldNotBe: "MONTHLY_SUMMARY",
    reason: "Has 'routes' and 'faces' keywords - should be route analysis, not monthly summary"
  },
  {
    query: "Show monthly summary for January 2025",
    expectedIntent: "MONTHLY_SUMMARY",
    shouldNotBe: null,
    reason: "Has 'monthly summary' - should correctly route to MONTHLY_SUMMARY"
  },
  {
    query: "Show production for January 2025",
    expectedIntent: "DATA_RETRIEVAL",
    shouldNotBe: "MONTHLY_SUMMARY",
    reason: "Just mentions month as filter - should be data retrieval, not monthly summary"
  },
  {
    query: "Total production in January",
    expectedIntent: "AGGREGATION_QUERY",
    shouldNotBe: "MONTHLY_SUMMARY",
    reason: "Aggregation query with month filter - not monthly summary"
  }
];

console.log('═══════════════════════════════════════════════════════════');
console.log('MONTHLY_SUMMARY Intent Debug Test');
console.log('═══════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`\n📝 Query: "${testCase.query}"`);
  console.log(`   Expected: ${testCase.expectedIntent}`);
  console.log(`   Reason: ${testCase.reason}\n`);
  
  try {
    const result = normalizeUserQuery(testCase.query);
    
    console.log(`   ✓ Detected Intent: ${result.intent}`);
    console.log(`   ✓ Confidence: ${result.confidence.toFixed(2)}`);
    console.log(`   ✓ Matched Keywords: [${result.matched_keywords.join(', ')}]`);
    
    if (result.fuzzy_matches && result.fuzzy_matches.length > 0) {
      console.log(`   ✓ Fuzzy Matches: [${result.fuzzy_matches.join(', ')}]`);
    }
    
    // Check if intent matches expected
    const intentMatches = result.intent === testCase.expectedIntent;
    const notWrongIntent = testCase.shouldNotBe ? result.intent !== testCase.shouldNotBe : true;
    
    if (intentMatches && notWrongIntent) {
      console.log(`   ✅ PASS - Correct intent detected`);
      passed++;
    } else if (!intentMatches) {
      console.log(`   ❌ FAIL - Expected ${testCase.expectedIntent}, got ${result.intent}`);
      failed++;
    } else if (!notWrongIntent) {
      console.log(`   ❌ FAIL - Should NOT be ${testCase.shouldNotBe}, but got ${result.intent}`);
      failed++;
    }
    
    // Show parameters for debugging
    if (Object.keys(result.parameters).length > 0) {
      console.log(`   📊 Parameters: ${JSON.stringify(result.parameters, null, 2)}`);
    }
    
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    console.error(error);
    failed++;
  }
  
  console.log('───────────────────────────────────────────────────────────');
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════\n');

if (failed > 0) {
  console.log('\n🔍 Debugging Tips:');
  console.log('1. Check MONTHLY_SUMMARY keywords in src/router/services/intent.ts');
  console.log('2. Check tier filtering logic (TIER_1 should override TIER_2)');
  console.log('3. Check mutual exclusion rules (CHART_VISUALIZATION should override MONTHLY_SUMMARY)');
  console.log('4. Check if month names are in MONTHLY_SUMMARY keywords (they should NOT be)');
  process.exit(1);
}

process.exit(0);
