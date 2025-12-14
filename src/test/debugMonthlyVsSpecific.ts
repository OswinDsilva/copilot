/**
 * Debug why "15 January 2025 production" routes to MONTHLY_SUMMARY
 */

import { routeQuestion } from '../router/index.js';
import { parseDate } from '../router/helpers/dateParser.js';

async function debugMonthlyVsSpecific() {
  const queries = [
    "15 January 2025 production",
    "January 15 2025 production",
    "Show production on January 15"
  ];
  
  for (const query of queries) {
    console.log('Query:', query);
    
    // Check date parsing
    const parsed = parseDate(query);
    console.log('Parsed date type:', parsed?.type);
    console.log('Parsed date:', JSON.stringify(parsed, null, 2));
    
    // Check routing
    const decision = await routeQuestion(query);
    console.log('Intent:', decision.intent);
    console.log('Has month param:', !!decision.parameters?.month);
    console.log('Has date param:', !!decision.parameters?.date);
    console.log('');
  }
}

debugMonthlyVsSpecific().catch(console.error);
