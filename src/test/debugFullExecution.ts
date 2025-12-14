/**
 * Debug full execution path for January 2025 summary query
 * This tests the complete flow: routing → SQL generation → SQL execution
 */

import { routeQuestion, generateSQLFromIntent } from '../router/index.js';

async function debugFullExecution() {
  const query = "Give me a complete summary of January 2025 production including total tonnage, trips, and equipment utilization";
  
  console.log('=== STEP 1: ROUTING ===');
  const decision = await routeQuestion(query);
  console.log('Intent:', decision.intent);
  console.log('Task:', decision.task);
  console.log('Parameters:', JSON.stringify(decision.parameters, null, 2));
  console.log('');
  
  console.log('=== STEP 2: SQL GENERATION ===');
  // generateSQLFromIntent takes (decision, schema, settings, chatHistory)
  // For testing, we'll pass minimal values
  const sqlQuery = await generateSQLFromIntent(decision, '', undefined, []);
  console.log('SQL Generated:', sqlQuery);
  console.log('');
  
  console.log('=== STEP 3: SQL ANALYSIS ===');
  const sql = sqlQuery || '';
  
  // Check for GROUP BY
  const hasGroupBy = /GROUP\s+BY/i.test(sql);
  const groupByMatch = sql.match(/GROUP\s+BY\s+([^;\s]+(?:\s*,\s*[^;\s]+)*)/i);
  console.log('Has GROUP BY:', hasGroupBy);
  if (hasGroupBy) {
    console.log('GROUP BY columns:', groupByMatch?.[1]);
  }
  
  // Check for aggregation functions
  const hasAggregation = /\b(SUM|AVG|COUNT|MAX|MIN)\s*\(/i.test(sql);
  console.log('Has aggregation functions:', hasAggregation);
  
  // Expected behavior
  console.log('');
  console.log('=== EXPECTED BEHAVIOR ===');
  if (hasAggregation && !hasGroupBy) {
    console.log('✅ Should return SINGLE ROW with aggregated totals');
  } else if (hasAggregation && hasGroupBy) {
    console.log('❌ Will return MULTIPLE ROWS grouped by', groupByMatch?.[1] || 'unknown');
  } else {
    console.log('⚠️ No aggregation - will return raw rows');
  }
}

debugFullExecution().catch(console.error);
