/**
 * Test Runner for Comprehensive Query Test Suite
 * 
 * This script runs all test queries through your routing system
 * and validates intent detection and routing decisions.
 */

const { comprehensiveTestQueries } = require('./test-comprehensive-queries.js');

// Since we can't import TS directly, we'll use a simpler approach
// Import the router from the built JS files
let routeQuestion;

async function loadRouter() {
  try {
    // Try to load from dist/build directory
    const router = await import('./dist/router/index.js');
    routeQuestion = router.routeQuestion;
  } catch (e) {
    console.error('Could not load router from dist. Please build the project first:');
    console.error('  npm run build');
    console.error('\nOr run tests using vitest:');
    console.error('  npm test');
    process.exit(1);
  }
}

async function runComprehensiveTests() {
  console.log('='.repeat(80));
  console.log('COMPREHENSIVE ROUTING & INTENT TEST SUITE');
  console.log('='.repeat(80));
  console.log(`\nRunning ${comprehensiveTestQueries.length} test queries...\n`);

  let passed = 0;
  let failed = 0;
  let warnings = 0;
  const failures = [];

  for (let i = 0; i < comprehensiveTestQueries.length; i++) {
    const test = comprehensiveTestQueries[i];
    const testNum = i + 1;

    try {
      // Route the question
      const result = await routeQuestion(test.query);

      // Validate results
      let testPassed = true;
      const issues = [];

      // Check task routing
      if (test.expectedTask && result.task !== test.expectedTask) {
        issues.push(`Task mismatch: expected '${test.expectedTask}', got '${result.task}'`);
        testPassed = false;
      }

      // Check intent
      if (test.expectedIntent && result.intent !== test.expectedIntent) {
        issues.push(`Intent mismatch: expected '${test.expectedIntent}', got '${result.intent}'`);
        // Don't fail on intent mismatch, just warn
        warnings++;
      }

      // Log result
      if (testPassed && issues.length === 0) {
        console.log(`✅ Test ${testNum}: "${test.query}"`);
        console.log(`   → Task: ${result.task}, Intent: ${result.intent}, Confidence: ${result.confidence}`);
        passed++;
      } else if (testPassed && issues.length > 0) {
        console.log(`⚠️  Test ${testNum}: "${test.query}"`);
        console.log(`   → Task: ${result.task}, Intent: ${result.intent}, Confidence: ${result.confidence}`);
        issues.forEach(issue => console.log(`   ⚠️  ${issue}`));
      } else {
        console.log(`❌ Test ${testNum}: "${test.query}"`);
        console.log(`   → Task: ${result.task}, Intent: ${result.intent}, Confidence: ${result.confidence}`);
        issues.forEach(issue => console.log(`   ❌ ${issue}`));
        failed++;
        failures.push({ testNum, query: test.query, issues, result });
      }

      // Add spacing between tests for readability
      if (testNum % 10 === 0) {
        console.log('');
      }

    } catch (error) {
      console.log(`❌ Test ${testNum}: "${test.query}"`);
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
      failures.push({ testNum, query: test.query, issues: [error.message], result: null });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${comprehensiveTestQueries.length}`);
  console.log(`✅ Passed: ${passed} (${((passed / comprehensiveTestQueries.length) * 100).toFixed(1)}%)`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Failed: ${failed} (${((failed / comprehensiveTestQueries.length) * 100).toFixed(1)}%)`);

  if (failures.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('FAILED TESTS DETAILS');
    console.log('='.repeat(80));
    failures.forEach(({ testNum, query, issues, result }) => {
      console.log(`\nTest ${testNum}: "${query}"`);
      issues.forEach(issue => console.log(`  - ${issue}`));
      if (result) {
        console.log(`  Actual: Task=${result.task}, Intent=${result.intent}, Confidence=${result.confidence}`);
      }
    });
  }

  console.log('\n' + '='.repeat(80));
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
(async () => {
  await loadRouter();
  await runComprehensiveTests();
})().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
