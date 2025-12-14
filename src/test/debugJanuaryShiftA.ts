/**
 * Debug January 2025 summary with shift A filter
 */

import { routeQuestion } from '../router/index.js';
import { buildSQL } from '../router/sqlBuilder.js';

async function debugJanuaryShiftA() {
  // Test the exact query that's generating the wrong SQL
  const query = "Give me a complete summary of January 2025 production including total tonnage, trips, and equipment utilization for shift A";
  
  console.log('Query:', query);
  console.log('');
  
  console.log('=== ROUTING DECISION ===');
  const decision = await routeQuestion(query);
  console.log('Intent:', decision.intent);
  console.log('Task:', decision.task);
  console.log('Parameters:', JSON.stringify(decision.parameters, null, 2));
  console.log('');
  
  console.log('=== SQL GENERATION ===');
  const sql = buildSQL(decision.intent || 'MONTHLY_SUMMARY', decision.parameters || {}, query);
  console.log('Generated SQL:');
  console.log(sql);
  console.log('');
  
  console.log('=== ANALYSIS ===');
  const hasGroupBy = /GROUP\s+BY/i.test(sql || '');
  const hasAggregation = /\b(SUM|AVG|COUNT|MAX|MIN)\s*\(/i.test(sql || '');
  const hasBetween = /BETWEEN/i.test(sql || '');
  const hasShiftFilter = /shift\s+IN/i.test(sql || '');
  
  console.log('Has BETWEEN dates:', hasBetween);
  console.log('Has shift IN filter:', hasShiftFilter);
  console.log('Has GROUP BY:', hasGroupBy);
  console.log('Has aggregation functions:', hasAggregation);
  console.log('');
  
  if (hasBetween) {
    console.log('❌ WRONG: Using BETWEEN dates (returns individual rows)');
  }
  if (hasAggregation && !hasGroupBy) {
    console.log('✅ CORRECT: Aggregation without GROUP BY (returns single summary row)');
  }
  if (hasAggregation && hasGroupBy) {
    console.log('⚠️  PARTIAL: Aggregation with GROUP BY (returns grouped rows)');
  }
}

debugJanuaryShiftA().catch(console.error);
