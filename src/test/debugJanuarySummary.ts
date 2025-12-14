/**
 * Debug query: "Give me a complete summary of January 2025 production including total tonnage, trips, and equipment utilization"
 */

import { routeQuestion } from '../router';
import { buildSQL } from '../router/sqlBuilder';

async function debugJanuarySummary() {
  const query = 'Give me a complete summary of January 2025 production including total tonnage, trips, and equipment utilization';
  
  console.log('Query:', query);
  console.log('');
  
  // Step 1: See how it routes
  const decision = await routeQuestion(query);
  console.log('=== ROUTING DECISION ===');
  console.log('Intent:', decision.intent);
  console.log('Task:', decision.task);
  console.log('Template:', decision.template_used);
  console.log('Parameters:', JSON.stringify(decision.parameters, null, 2));
  console.log('');
  
  // Step 2: See what SQL is generated
  if (decision.intent && decision.parameters) {
    console.log('=== SQL GENERATION ===');
    const sql = buildSQL(decision.intent, decision.parameters, query);
    console.log('Generated SQL:');
    console.log(sql);
    console.log('');
    
    if (sql) {
      console.log('=== ANALYSIS ===');
      if (sql.includes('GROUP BY')) {
        console.log('✅ Has GROUP BY - should aggregate');
      } else {
        console.log('❌ NO GROUP BY - will return individual rows!');
      }
      
      if (sql.includes('SUM(') || sql.includes('AVG(') || sql.includes('COUNT(')) {
        console.log('✅ Has aggregation functions');
      } else {
        console.log('⚠️ No aggregation functions found');
      }
    }
  }
}

debugJanuarySummary().catch(console.error);
