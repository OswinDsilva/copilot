import { normalizeUserQuery } from '../src/router/services/intent.js';

const testQueries = [
  'Which tippers made the most trips in January 2025',
  'Show excavator performance in March',
  'Top 5 vehicles in April 2025',
  'List all trips in February',
  'What equipment worked in January',
  'Best tipper in December'
];

console.log('\n=== Testing Equipment Focus Queries ===\n');

testQueries.forEach(query => {
  const result = normalizeUserQuery(query);
  const pass = result.intent !== 'GET_MONTHLY_SUMMARY' ? '✓' : '✗';
  console.log(`${pass} "${query}"`);
  console.log(`  Intent: ${result.intent} (confidence: ${result.confidence})`);
  console.log('');
});
