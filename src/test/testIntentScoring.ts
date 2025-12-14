/**
 * Deep debug test for intent scoring
 */

import { normalizeUserQuery } from '../router/services/intent';

const query = 'Show shift A, B, C production with different colors for January 2025';

console.log('Query:', query);
console.log('');

const result = normalizeUserQuery(query);

console.log('Result:');
console.log('- Intent:', result.intent);
console.log('- Confidence:', result.confidence);
console.log('- Matched Keywords:', result.matched_keywords);
console.log('- Parameters:', JSON.stringify(result.parameters, null, 2));
