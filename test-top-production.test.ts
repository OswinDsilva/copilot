import { describe, it, expect } from 'vitest';
import { normalizeUserQuery } from './src/router/services/intent';

describe('Top Production Days Query', () => {
  it('should route "top 5 highest production days" correctly', () => {
    const query = "Show me the top 5 highest production days in January 2025 with tonnage and cubic meters";
    const result = normalizeUserQuery(query);
    
    console.log('Query:', query);
    console.log('Intent:', result.intent);
    console.log('Confidence:', result.confidence);
    console.log('Matched keywords:', result.matched_keywords);
    console.log('Parameters:', result.parameters);
    
    // Should route to ORDINAL_ROW_QUERY or DATA_RETRIEVAL for top N days
    expect(['ORDINAL_ROW_QUERY', 'DATA_RETRIEVAL', 'AGGREGATION_QUERY']).toContain(result.intent);
  });
});
