/**
 * Test low confidence queries that should log to failures.log
 */

import { routeQuestion } from '../router';

async function testLowConfidence() {
  console.log('Testing low confidence logging...\n');
  
  // These should trigger confidence < 0.6 (MEDIUM threshold)
  const lowConfidenceQueries = [
    'xyz abc def',  // Random gibberish
    'hello world',  // Not mining related
    '???',          // Just symbols
  ];
  
  for (const query of lowConfidenceQueries) {
    try {
      const result = await routeQuestion(query);
      console.log(`Query: "${query}"`);
      console.log(`  Confidence: ${result.confidence}`);
      console.log(`  Correlation ID: ${(result as any).correlation_id}`);
      console.log(`  Should log: ${result.confidence < 0.6 ? 'YES' : 'NO'}\n`);
    } catch (error) {
      console.log(`Error for "${query}": ${(error as Error).message}\n`);
    }
  }
}

testLowConfidence();
