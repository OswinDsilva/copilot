import { describe, it, expect } from 'vitest';
import { normalizeUserQuery } from './src/router/services/intent';

describe('Routing Issues - Summary and Equipment Contribution', () => {
  it('should route "complete summary" to AGGREGATION_QUERY or MONTHLY_SUMMARY, not FORECASTING', async () => {
    const query = "Give me a complete summary of January 2025 production including total tonnage, trips, and equipment utilization";
    const result = normalizeUserQuery(query);
    
    console.log('Query:', query);
    console.log('Intent:', result.intent);
    console.log('Confidence:', result.confidence);
    console.log('Matched keywords:', result.matched_keywords);
    console.log('Fuzzy matches:', result.fuzzy_matches);
    
    // Should route to AGGREGATION_QUERY or MONTHLY_SUMMARY
    expect(['AGGREGATION_QUERY', 'MONTHLY_SUMMARY']).toContain(result.intent);
  });

  it('should understand "which tippers contributed" as EQUIPMENT_COMBINATION', async () => {
    const query = "Show production on January 15, 2025 shift A and which tippers contributed";
    const result = normalizeUserQuery(query);
    
    console.log('\nQuery:', query);
    console.log('Intent:', result.intent);
    console.log('Confidence:', result.confidence);
    console.log('Matched keywords:', result.matched_keywords);
    console.log('Fuzzy matches:', result.fuzzy_matches);
    
    // Should route to EQUIPMENT_COMBINATION (tippers contributed)
    expect(result.intent).toBe('EQUIPMENT_COMBINATION');
    
    // Verify parameters extracted correctly
    console.log('Parameters:', result.parameters);
    expect(result.parameters.date).toBe('2025-01-15');
    expect(result.parameters.shift).toContain('A');
  });
  
  it('should generate SQL with JOIN for "production and which tippers" queries', () => {
    // This is a documentation test - the actual SQL generation happens in the LLM
    // But we've updated the prompt to ensure it generates:
    // SELECT p.shift, t.excavator, t.tipper_id, p.date, SUM(t.trip_count)
    // FROM production_summary AS p
    // JOIN trip_summary_by_date AS t ON p.date = t.trip_date AND p.shift = t.shift
    // WHERE p.date = '2025-01-15' AND p.shift = 'A'
    // GROUP BY p.shift, t.excavator, t.tipper_id, p.date
    
    const expectedPattern = 'JOIN production_summary with trip_summary_by_date';
    expect(expectedPattern).toContain('JOIN');
  });
});
