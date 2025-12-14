/**
 * COMPREHENSIVE ROUTING TEST SUITE
 * 
 * Tests the complete routing pipeline with increasingly complex queries
 * that push the system to its limits. Covers edge cases, ambiguous queries,
 * multi-intent queries, and adversarial examples.
 * 
 * Test Categories:
 * 1. Basic Intent Detection (warmup)
 * 2. Ambiguous Queries (intent conflicts)
 * 3. Multi-Parameter Queries (complex extractions)
 * 4. Date/Time Edge Cases (parsing stress test)
 * 5. Equipment Queries (ID extraction, combinations)
 * 6. Chart/Visualization (no JOIN rules)
 * 7. Routes/Faces Analysis (mining-specific)
 * 8. Monthly Summary vs Date Filter (context-aware)
 * 9. Optimization vs Combination (disambiguation)
 * 10. Adversarial Examples (typos, fuzzy matching)
 */

import { normalizeUserQuery } from './src/router/services/intent.ts';
import { routeQuestion } from './src/router/index.ts';

// Test configuration
const SHOW_DETAILS = true; // Set to false for summary only
const STOP_ON_FAILURE = false; // Set to true to stop at first failure

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Test case structure
class TestCase {
  constructor(query, expectedIntent, expectedTask, category, notes = '') {
    this.query = query;
    this.expectedIntent = expectedIntent;
    this.expectedTask = expectedTask;
    this.category = category;
    this.notes = notes;
  }
}

// Test suite
const testCases = [
  // ===== CATEGORY 1: BASIC INTENT DETECTION (WARMUP) =====
  new TestCase(
    "Show production for January 2025",
    "DATA_RETRIEVAL",
    "sql",
    "Basic",
    "Simple date filter query"
  ),
  new TestCase(
    "Plot production for January 2025",
    "CHART_VISUALIZATION",
    "sql",
    "Basic",
    "Chart with month filter"
  ),
  new TestCase(
    "How to improve safety procedures?",
    "ADVISORY_QUERY",
    "rag",
    "Basic",
    "Advisory query for RAG"
  ),
  new TestCase(
    "Recommend best equipment combination",
    "EQUIPMENT_OPTIMIZATION",
    "optimize",
    "Basic",
    "Optimization query"
  ),
  new TestCase(
    "Forecast next month production",
    "FORECASTING",
    "optimize",
    "Basic",
    "Forecasting query"
  ),

  // ===== CATEGORY 2: AMBIGUOUS QUERIES (INTENT CONFLICTS) =====
  new TestCase(
    "Show me the best tipper from January",
    "ORDINAL_ROW_QUERY", // "best" = top 1, but could be EQUIPMENT_SPECIFIC
    "sql",
    "Ambiguous",
    "Best = top 1 (ordinal) vs equipment query"
  ),
  new TestCase(
    "What is the average production for shift A?",
    "AGGREGATION_QUERY", // Has "average" but shift-specific
    "sql",
    "Ambiguous",
    "Aggregation + shift parameter"
  ),
  new TestCase(
    "Give me a summary of January 2025",
    "MONTHLY_SUMMARY", // Has "summary" + month
    "sql",
    "Ambiguous",
    "Monthly summary vs general data retrieval"
  ),
  new TestCase(
    "Show total trips and total tonnage for January 15th",
    "AGGREGATION_QUERY", // Multiple aggregations, specific date
    "sql",
    "Ambiguous",
    "Should NOT be MONTHLY_SUMMARY (specific date)"
  ),
  new TestCase(
    "Which excavator worked with tipper BB-44?",
    "EQUIPMENT_COMBINATION", // Equipment pairing
    "sql",
    "Ambiguous",
    "Combination vs equipment-specific production"
  ),

  // ===== CATEGORY 3: MULTI-PARAMETER QUERIES (COMPLEX EXTRACTIONS) =====
  new TestCase(
    "Show shift A and shift B production for January 12th to January 24th with different colors",
    "CHART_VISUALIZATION", // Chart + multi-shift + date range
    "sql",
    "Multi-Parameter",
    "Chart + 2 shifts + date range + color coding"
  ),
  new TestCase(
    "Top 5 tippers by tonnage in shift C during the first week of February 2025",
    "ORDINAL_ROW_QUERY", // Top N + shift + date range
    "sql",
    "Multi-Parameter",
    "Top N + shift + relative date range"
  ),
  new TestCase(
    "List all excavators that moved more than 500 tons in January with trip count above 100",
    "DATA_RETRIEVAL", // Multiple numeric filters + date
    "sql",
    "Multi-Parameter",
    "Dual numeric filters + date filter"
  ),
  new TestCase(
    "Compare production between route 5 and route 7 for Q1 2025",
    "ROUTES_FACES_ANALYSIS", // Route comparison + quarter
    "sql",
    "Multi-Parameter",
    "Route analysis + quarter filter"
  ),
  new TestCase(
    "Average tonnage per tipper for shift A, B, and C in January 2025",
    "AGGREGATION_QUERY", // Aggregation + multiple shifts + month
    "sql",
    "Multi-Parameter",
    "Aggregation + 3 shifts + month filter"
  ),

  // ===== CATEGORY 4: DATE/TIME EDGE CASES (PARSING STRESS TEST) =====
  new TestCase(
    "Show production from january 12th to january 24th",
    "DATA_RETRIEVAL", // Day-to-day range
    "sql",
    "Date Edge Case",
    "Day-to-day range within same month"
  ),
  new TestCase(
    "Plot production from Jan 28th to Feb 5th",
    "CHART_VISUALIZATION", // Cross-month range
    "sql",
    "Date Edge Case",
    "Date range spanning two months"
  ),
  new TestCase(
    "Production for Q4 2024",
    "DATA_RETRIEVAL", // Quarter
    "sql",
    "Date Edge Case",
    "Quarter-based date filter"
  ),
  new TestCase(
    "Show last week's production",
    "DATA_RETRIEVAL", // Relative date
    "sql",
    "Date Edge Case",
    "Relative date range (last week)"
  ),
  new TestCase(
    "Yesterday's shift B tonnage",
    "DATA_RETRIEVAL", // Relative date + shift
    "sql",
    "Date Edge Case",
    "Relative date (yesterday) + shift"
  ),
  new TestCase(
    "Production between December 1st 2024 and January 15th 2025",
    "DATA_RETRIEVAL", // Cross-year range
    "sql",
    "Date Edge Case",
    "Date range spanning two years"
  ),

  // ===== CATEGORY 5: EQUIPMENT QUERIES (ID EXTRACTION, COMBINATIONS) =====
  new TestCase(
    "Show trips for tipper BB-44 and BB-45 in January",
    "EQUIPMENT_SPECIFIC_PRODUCTION", // Multiple equipment IDs
    "sql",
    "Equipment",
    "Multiple equipment IDs + month filter"
  ),
  new TestCase(
    "Which tippers worked with excavator EX-189?",
    "EQUIPMENT_COMBINATION", // Equipment pairing
    "sql",
    "Equipment",
    "Equipment combination query"
  ),
  new TestCase(
    "Top 3 excavators by trip count",
    "ORDINAL_ROW_QUERY", // Top N equipment
    "sql",
    "Equipment",
    "Top N equipment (no date filter)"
  ),
  new TestCase(
    "Performance of BB-001 vs BB-002 in shift A",
    "EQUIPMENT_SPECIFIC_PRODUCTION", // Equipment comparison
    "sql",
    "Equipment",
    "Equipment comparison + shift filter"
  ),
  new TestCase(
    "Should I pick tipper BB-44 or BB-45 for shift B?",
    "EQUIPMENT_OPTIMIZATION", // Optimization with equipment IDs
    "optimize",
    "Equipment",
    "Optimization query with specific equipment"
  ),

  // ===== CATEGORY 6: CHART/VISUALIZATION (NO JOIN RULES) =====
  new TestCase(
    "Create a chart to show production from january 12th to january 24th",
    "CHART_VISUALIZATION", // Chart + date range
    "sql",
    "Chart",
    "Chart with day-to-day range (should NOT JOIN)"
  ),
  new TestCase(
    "Plot shift A, B, C production with different colors for January",
    "CHART_VISUALIZATION", // Chart + multi-shift
    "sql",
    "Chart",
    "Multi-shift chart (should NOT JOIN)"
  ),
  new TestCase(
    "Graph tonnage and volume overlay for Q1",
    "CHART_VISUALIZATION", // Chart + multi-metric + quarter
    "sql",
    "Chart",
    "Multi-metric chart (should NOT JOIN)"
  ),
  new TestCase(
    "Visualize production trend for the last 30 days",
    "CHART_VISUALIZATION", // Chart + relative date
    "sql",
    "Chart",
    "Trend chart with relative date"
  ),
  new TestCase(
    "Bar chart of daily production for February 2025",
    "CHART_VISUALIZATION", // Chart type + month
    "sql",
    "Chart",
    "Specific chart type (bar chart)"
  ),

  // ===== CATEGORY 7: ROUTES/FACES ANALYSIS (MINING-SPECIFIC) =====
  new TestCase(
    "What are the most used routes in January 2025?",
    "ROUTES_FACES_ANALYSIS", // Routes + month filter
    "sql",
    "Routes/Faces",
    "Most used routes (should NOT be MONTHLY_SUMMARY)"
  ),
  new TestCase(
    "Show production by face for shift A",
    "ROUTES_FACES_ANALYSIS", // Faces + shift
    "sql",
    "Routes/Faces",
    "Face analysis + shift filter"
  ),
  new TestCase(
    "Which haul route had the highest tonnage in Q4?",
    "ROUTES_FACES_ANALYSIS", // Route + ordinal + quarter
    "sql",
    "Routes/Faces",
    "Route analysis + quarter filter"
  ),
  new TestCase(
    "Compare route efficiency between route 3 and route 8",
    "ROUTES_FACES_ANALYSIS", // Route comparison
    "sql",
    "Routes/Faces",
    "Route comparison query"
  ),
  new TestCase(
    "List all active mining faces in January",
    "ROUTES_FACES_ANALYSIS", // Faces + month
    "sql",
    "Routes/Faces",
    "Active faces query"
  ),

  // ===== CATEGORY 8: MONTHLY SUMMARY VS DATE FILTER (CONTEXT-AWARE) =====
  new TestCase(
    "Monthly report for January 2025",
    "MONTHLY_SUMMARY", // Explicit "monthly report"
    "sql",
    "Monthly Context",
    "Should be MONTHLY_SUMMARY (explicit keyword)"
  ),
  new TestCase(
    "Show January 2025 production",
    "DATA_RETRIEVAL", // Month is just a filter
    "sql",
    "Monthly Context",
    "Should NOT be MONTHLY_SUMMARY (just month filter)"
  ),
  new TestCase(
    "January 15th production",
    "DATA_RETRIEVAL", // Specific date
    "sql",
    "Monthly Context",
    "Should NOT be MONTHLY_SUMMARY (specific date)"
  ),
  new TestCase(
    "Give me the monthly breakdown for Q1",
    "MONTHLY_SUMMARY", // Explicit "monthly breakdown"
    "sql",
    "Monthly Context",
    "Should be MONTHLY_SUMMARY (explicit keyword)"
  ),
  new TestCase(
    "Which tipper had the highest tonnage in January 2025?",
    "ORDINAL_ROW_QUERY", // Equipment focus, month is filter
    "sql",
    "Monthly Context",
    "Should NOT be MONTHLY_SUMMARY (equipment focus)"
  ),

  // ===== CATEGORY 9: OPTIMIZATION VS COMBINATION (DISAMBIGUATION) =====
  new TestCase(
    "What is the best combination of tipper and excavator?",
    "EQUIPMENT_OPTIMIZATION", // "best" = optimization
    "optimize",
    "Optimization",
    "Should be OPTIMIZATION (best = recommendation)"
  ),
  new TestCase(
    "Which combinations of tipper and excavator were used?",
    "EQUIPMENT_COMBINATION", // Past tense = historical
    "sql",
    "Optimization",
    "Should be COMBINATION (past tense = data)"
  ),
  new TestCase(
    "Show me the optimal equipment setup",
    "EQUIPMENT_OPTIMIZATION", // "optimal" = optimization
    "optimize",
    "Optimization",
    "Should be OPTIMIZATION (optimal = recommendation)"
  ),
  new TestCase(
    "List all tipper-excavator pairs from January",
    "EQUIPMENT_COMBINATION", // "list" = data retrieval
    "sql",
    "Optimization",
    "Should be COMBINATION (list = data)"
  ),
  new TestCase(
    "Help me choose the best tipper and excavator for shift B",
    "EQUIPMENT_OPTIMIZATION", // "help me choose" = optimization
    "optimize",
    "Optimization",
    "Should be OPTIMIZATION (help me choose)"
  ),

  // ===== CATEGORY 10: ADVERSARIAL EXAMPLES (TYPOS, FUZZY MATCHING) =====
  new TestCase(
    "Plot prodcution for Januray 2025",
    "CHART_VISUALIZATION", // Typos in "production" and "January"
    "sql",
    "Adversarial",
    "Typos should still match (fuzzy matching)"
  ),
  new TestCase(
    "Shw me the averge tonnge for shft A",
    "AGGREGATION_QUERY", // Multiple typos
    "sql",
    "Adversarial",
    "Multiple typos (fuzzy matching stress test)"
  ),
  new TestCase(
    "What is the bst combinaton of equipmnt?",
    "EQUIPMENT_OPTIMIZATION", // Typos in "best", "combination", "equipment"
    "optimize",
    "Adversarial",
    "Typos should route to OPTIMIZATION (not COMBINATION)"
  ),
  new TestCase(
    "Forcast next month production",
    "FORECASTING", // Typo in "forecast"
    "optimize",
    "Adversarial",
    "Typo in forecasting keyword"
  ),
  new TestCase(
    "Wich tipers had the higest tonnage?",
    "ORDINAL_ROW_QUERY", // Multiple typos
    "sql",
    "Adversarial",
    "Multiple typos (which, tippers, highest)"
  ),

  // ===== CATEGORY 11: EXTREMELY COMPLEX QUERIES (STRESS TEST) =====
  new TestCase(
    "Show me a bar chart comparing shift A and B production for routes 5, 7, and 9 from January 12th to February 5th with tonnage above 200 tons",
    "CHART_VISUALIZATION", // Chart + multi-shift + multi-route + date range + numeric filter
    "sql",
    "Stress Test",
    "Ultimate complexity: chart + 2 shifts + 3 routes + date range + filter"
  ),
  new TestCase(
    "What is the optimal combination of tipper and excavator for shift C based on last week's performance with at least 50 trips per day?",
    "EQUIPMENT_OPTIMIZATION", // Optimization + shift + relative date + numeric filter
    "optimize",
    "Stress Test",
    "Complex optimization with multiple constraints"
  ),
  new TestCase(
    "Forecast production for next quarter by route and shift with confidence intervals",
    "FORECASTING", // Forecasting + grouping + statistical terms
    "optimize",
    "Stress Test",
    "Advanced forecasting with statistical analysis"
  ),
  new TestCase(
    "Compare the top 5 tippers vs top 5 excavators by tonnage efficiency in Q1 2025 grouped by route",
    "ORDINAL_ROW_QUERY", // Top N + comparison + grouping + quarter
    "sql",
    "Stress Test",
    "Complex comparison with multiple top N groups"
  ),
  new TestCase(
    "How to improve equipment utilization for routes with below-average production in shift A during peak hours?",
    "ADVISORY_QUERY", // Advisory + complex filtering
    "rag",
    "Stress Test",
    "Advisory query with complex contextual filters"
  ),

  // ===== CATEGORY 12: EDGE CASES (MINIMAL INFORMATION) =====
  new TestCase(
    "January",
    "DATA_RETRIEVAL", // Just month name
    "sql",
    "Edge Case",
    "Minimal query (just month name)"
  ),
  new TestCase(
    "Shift A",
    "DATA_RETRIEVAL", // Just shift
    "sql",
    "Edge Case",
    "Minimal query (just shift)"
  ),
  new TestCase(
    "BB-44",
    "EQUIPMENT_SPECIFIC_PRODUCTION", // Just equipment ID
    "sql",
    "Edge Case",
    "Minimal query (just equipment ID)"
  ),
  new TestCase(
    "Chart",
    "CHART_VISUALIZATION", // Just "chart"
    "sql",
    "Edge Case",
    "Minimal query (just chart)"
  ),
  new TestCase(
    "Forecast",
    "FORECASTING", // Just "forecast"
    "optimize",
    "Edge Case",
    "Minimal query (just forecast)"
  ),
];

// Test runner
async function runTests() {
  console.log(`${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║   COMPREHENSIVE ROUTING TEST SUITE                             ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║   Testing ${testCases.length} queries across 12 categories                      ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log();

  const results = {
    total: testCases.length,
    passed: 0,
    failed: 0,
    byCategory: {},
  };

  // Mock schema and settings for router
  const mockSchema = {
    tables: {
      production_summary: { columns: ['date', 'shift', 'qty_ton', 'qty_m3', 'target_ton', 'target_m3'] },
      trip_summary_by_date: { columns: ['trip_date', 'shift', 'tipper_id', 'excavator', 'route_or_face', 'trip_count'] }
    }
  };

  const mockSettings = {
    openaiApiKey: 'test-key',
    vectorStore: 'pgvector'
  };

  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    
    // Initialize category stats
    if (!results.byCategory[test.category]) {
      results.byCategory[test.category] = { passed: 0, failed: 0, total: 0 };
    }
    results.byCategory[test.category].total++;

    console.log(`${colors.bright}[${i + 1}/${testCases.length}] ${test.category}: ${colors.reset}${test.query}`);
    
    try {
      // Step 1: Intent normalization
      const intentResult = normalizeUserQuery(test.query);
      
      // Step 2: Routing decision
      const decision = await routeQuestion(test.query, mockSchema, mockSettings);
      
      // Check if intent matches expected
      const intentMatch = intentResult.intent === test.expectedIntent;
      const taskMatch = decision.task === test.expectedTask;
      
      if (intentMatch && taskMatch) {
        results.passed++;
        results.byCategory[test.category].passed++;
        console.log(`  ${colors.green}✓ PASS${colors.reset}`);
        
        if (SHOW_DETAILS) {
          console.log(`    Intent: ${intentResult.intent} (confidence: ${intentResult.confidence})`);
          console.log(`    Task: ${decision.task} (route_source: ${decision.route_source})`);
          if (test.notes) console.log(`    ${colors.blue}Note: ${test.notes}${colors.reset}`);
        }
      } else {
        results.failed++;
        results.byCategory[test.category].failed++;
        console.log(`  ${colors.red}✗ FAIL${colors.reset}`);
        console.log(`    ${colors.yellow}Expected:${colors.reset} intent=${test.expectedIntent}, task=${test.expectedTask}`);
        console.log(`    ${colors.yellow}Got:${colors.reset} intent=${intentResult.intent}, task=${decision.task}`);
        console.log(`    Confidence: ${intentResult.confidence}, Route: ${decision.route_source}`);
        if (intentResult.matched_keywords?.length > 0) {
          console.log(`    Matched Keywords: ${intentResult.matched_keywords.join(', ')}`);
        }
        if (test.notes) console.log(`    ${colors.blue}Note: ${test.notes}${colors.reset}`);
        
        if (STOP_ON_FAILURE) {
          console.log(`\n${colors.red}Stopping at first failure (STOP_ON_FAILURE=true)${colors.reset}`);
          break;
        }
      }
      
      console.log(); // Blank line between tests
      
    } catch (error) {
      results.failed++;
      results.byCategory[test.category].failed++;
      console.log(`  ${colors.red}✗ ERROR${colors.reset}`);
      console.log(`    ${colors.red}${error.message}${colors.reset}`);
      console.log();
      
      if (STOP_ON_FAILURE) {
        console.log(`\n${colors.red}Stopping at first failure (STOP_ON_FAILURE=true)${colors.reset}`);
        break;
      }
    }
  }

  // Print summary
  console.log(`${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║   TEST SUMMARY                                                 ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log();
  console.log(`Total Tests: ${results.total}`);
  console.log(`${colors.green}Passed: ${results.passed} (${Math.round(results.passed / results.total * 100)}%)${colors.reset}`);
  console.log(`${colors.red}Failed: ${results.failed} (${Math.round(results.failed / results.total * 100)}%)${colors.reset}`);
  console.log();
  
  console.log(`${colors.bright}Results by Category:${colors.reset}`);
  for (const [category, stats] of Object.entries(results.byCategory)) {
    const passRate = Math.round(stats.passed / stats.total * 100);
    const color = passRate === 100 ? colors.green : passRate >= 80 ? colors.yellow : colors.red;
    console.log(`  ${category}: ${color}${stats.passed}/${stats.total} (${passRate}%)${colors.reset}`);
  }
  
  console.log();
  
  // Final verdict
  if (results.failed === 0) {
    console.log(`${colors.bright}${colors.green}🎉 ALL TESTS PASSED! 🎉${colors.reset}`);
  } else {
    console.log(`${colors.bright}${colors.red}❌ ${results.failed} TEST(S) FAILED${colors.reset}`);
  }
  
  process.exit(results.failed === 0 ? 0 : 1);
}

// Run tests
runTests().catch(err => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err);
  process.exit(1);
});
