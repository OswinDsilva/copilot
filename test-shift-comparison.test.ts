import { describe, it, expect } from 'vitest';
import { normalizeUserQuery } from './src/router/services/intent';

describe('Shift Comparison Query', () => {
  it('should route "Compare total and average production by shift for January 2025"', () => {
    const query = "Compare total and average production by shift for January 2025";
    const result = normalizeUserQuery(query);
    
    console.log('Query:', query);
    console.log('Intent:', result.intent);
    console.log('Confidence:', result.confidence);
    console.log('Matched keywords:', result.matched_keywords);
    console.log('Parameters:', result.parameters);
    
    // Should route to AGGREGATION_QUERY or MONTHLY_SUMMARY
    expect(['AGGREGATION_QUERY', 'MONTHLY_SUMMARY', 'DATA_RETRIEVAL']).toContain(result.intent);
  });
});
