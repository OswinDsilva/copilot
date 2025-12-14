/**
 * Test to debug why different queries route to the same intent
 */

import { routeQuestion } from '../router';

async function testQueryRouting() {
  const queries = [
    'show excavator performance with total trips and how many tippers each worked with in January 2025',
    'Show shift A, B, C production with different colors for January 2025',
    'Give me a complete summary of January 2025 production including total tonnage, trips, and equipment utilization'
  ];

  for (const query of queries) {
    console.log('═══════════════════════════════════════════════════');
    console.log(`Query: "${query}"\n`);
    
    const decision = await routeQuestion(query);
    
    console.log('Intent:', decision.intent);
    console.log('Confidence:', decision.confidence);
    console.log('Task:', decision.task);
    console.log('Parameters:', JSON.stringify(decision.parameters, null, 2));
    console.log('Template:', decision.template_used);
    console.log('Reason:', decision.reason);
    console.log('');
  }
}

testQueryRouting().catch(console.error);
