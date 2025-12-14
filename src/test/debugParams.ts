/**
 * Debug parameter extraction
 */

import { normalizeUserQuery } from '../router/services/intent';

async function debugParams() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Debug Parameter Extraction');
  console.log('═══════════════════════════════════════════════════\n');
  
  const queries = [
    'Show me the top 5 highest production days in January 2025 with tonnage and cubic meters',
    'Compare total and average production by shift for January 2025',
    'What was the total production in January 2025?',
  ];
  
  for (const query of queries) {
    console.log(`Query: "${query}"`);
    const result = normalizeUserQuery(query);
    console.log(`Intent: ${result.intent} (confidence: ${result.confidence})`);
    console.log(`Parameters:`, JSON.stringify(result.parameters, null, 2));
    console.log('');
  }
}

debugParams();
