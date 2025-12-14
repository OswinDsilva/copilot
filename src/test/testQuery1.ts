import { normalizeUserQuery } from '../router/services/intent';

const query = 'show excavator performance with total trips and how many tippers each worked with in January 2025';

console.log('Query:', query);
console.log('');

const result = normalizeUserQuery(query);

console.log('Result:');
console.log('- Intent:', result.intent);
console.log('- Confidence:', result.confidence);
console.log('- Matched Keywords:', result.matched_keywords);
console.log('- Parameters:', JSON.stringify(result.parameters, null, 2));
