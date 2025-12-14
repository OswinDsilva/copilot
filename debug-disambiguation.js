import { normalizeUserQuery } from './src/router/services/intent.js';

const test_queries = [
  'best combinaton for production',
  'optimal combinaton today',
  'i hav to pick an excavator'
];

console.log('Testing EQUIPMENT_OPTIMIZATION disambiguation:\n');

for (const q of test_queries) {
  const result = normalizeUserQuery(q);
  console.log(`Query: "${q}"`);
  console.log(`  → Intent: ${result.intent}`);
  console.log(`  → Confidence: ${result.confidence}\n`);
}
