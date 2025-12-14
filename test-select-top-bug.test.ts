import { describe, it, expect } from 'vitest';
import { normalizeUserQuery } from './src/router/services/intent';

describe('Query Routing Bug - "select top 5"', () => {
  it('should route "select top 5 days with highest production" to DATA_RETRIEVAL, not OPTIMIZATION', () => {
    const query = "select top 5 days with highest production in tonnage";
    const result = normalizeUserQuery(query);
    
    console.log(`\nQuery: "${query}"`);
    console.log(`Intent: ${result.intent}`);
    console.log(`Confidence: ${result.confidence}`);
    console.log(`Matched keywords: ${result.matchedKeywords?.join(', ')}\n`);
    
    // "select top 5" with "highest" is being confused with optimization
    // This should be DATA_RETRIEVAL or ORDINAL_ROW_QUERY, not EQUIPMENT_OPTIMIZATION
    expect(['DATA_RETRIEVAL', 'ORDINAL_ROW_QUERY', 'AGGREGATION_QUERY']).toContain(result.intent);
  });
});
