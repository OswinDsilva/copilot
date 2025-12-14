import { normalizeUserQuery } from './src/router/services/intent.js';

const query = "select top 5 days with highest production in tonnage";
const result = normalizeUserQuery(query);

console.log(`Query: "${query}"`);
console.log(`Intent: ${result.intent}`);
console.log(`Confidence: ${result.confidence}`);
console.log(`Matched keywords: ${result.matchedKeywords?.join(', ')}`);
