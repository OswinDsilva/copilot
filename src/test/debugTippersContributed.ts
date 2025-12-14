/**
 * Debug "Show production on January 15, 2025 shift A and which tippers contributed"
 */

import { routeQuestion } from '../router/index.js';
import { buildSQL } from '../router/sqlBuilder.js';

async function debugTippersContributed() {
  const query = "Show production on January 15, 2025 shift A and which tippers contributed";
  
  console.log('Query:', query);
  console.log('');
  
  console.log('=== ROUTING DECISION ===');
  const decision = await routeQuestion(query);
  console.log('Intent:', decision.intent);
  console.log('Task:', decision.task);
  console.log('Parameters:', JSON.stringify(decision.parameters, null, 2));
  console.log('');
  
  console.log('=== SQL GENERATION ===');
  const sql = buildSQL(decision.intent || 'DATA_RETRIEVAL', decision.parameters || {}, query);
  console.log('Generated SQL:');
  console.log(sql);
  console.log('');
  
  console.log('=== ANALYSIS ===');
  console.log('❌ Expected intent: EQUIPMENT_COMBINATION (which tippers)');
  console.log('❌ Expected table: trip_summary_by_date (has tipper_id)');
  console.log('❌ Current intent:', decision.intent);
  console.log('');
  
  if (decision.intent !== 'EQUIPMENT_COMBINATION') {
    console.log('🔧 FIX NEEDED: Add "which tippers" keyword to EQUIPMENT_COMBINATION intent');
  }
}

debugTippersContributed().catch(console.error);
