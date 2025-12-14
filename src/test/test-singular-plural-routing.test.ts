import { describe, it, expect } from 'vitest';
import { normalizeUserQuery } from '../router/services/intent';

/**
 * Test for singular vs plural equipment query routing
 * 
 * Issue: "which tipper made most trips" was routing to EQUIPMENT_OPTIMIZATION
 *        while "which tippers made most trips" correctly routed to EQUIPMENT_COMBINATION
 * 
 * Root cause: 'which tipper' was in EQUIPMENT_OPTIMIZATION keywords (line 26)
 *             'which tippers' was in EQUIPMENT_COMBINATION keywords (line 46)
 * 
 * Fix: Removed singular forms from EQUIPMENT_OPTIMIZATION, added them to EQUIPMENT_COMBINATION
 *      - EQUIPMENT_OPTIMIZATION is for recommendations ("which should I choose?")
 *      - EQUIPMENT_COMBINATION is for data queries ("which worked?")
 */

describe('Singular vs Plural Equipment Query Routing', () => {
  it('should route "which tippers made most trips" to EQUIPMENT_COMBINATION', () => {
    const result = normalizeUserQuery('which tippers made most trips');
    
    expect(result.intent).toBe('EQUIPMENT_COMBINATION');
    expect(result.matched_keywords).toContain('which tippers');
  });

  it('should route "which tipper made most trips" to EQUIPMENT_COMBINATION (not OPTIMIZATION)', () => {
    const result = normalizeUserQuery('which tipper made most trips');
    
    expect(result.intent).toBe('EQUIPMENT_COMBINATION');
    expect(result.intent).not.toBe('EQUIPMENT_OPTIMIZATION');
    expect(result.matched_keywords).toContain('which tipper');
  });

  it('should route "which excavator worked on this project" to EQUIPMENT_COMBINATION', () => {
    const result = normalizeUserQuery('which excavator worked on this project');
    
    expect(result.intent).toBe('EQUIPMENT_COMBINATION');
    expect(result.matched_keywords).toContain('which excavator');
  });

  it('should route "which excavators contributed to production" to EQUIPMENT_COMBINATION', () => {
    const result = normalizeUserQuery('which excavators contributed to production');
    
    expect(result.intent).toBe('EQUIPMENT_COMBINATION');
  });

  it('should still route optimization questions correctly', () => {
    const result = normalizeUserQuery('which equipment should I choose for this project');
    
    expect(result.intent).toBe('EQUIPMENT_OPTIMIZATION');
    // Can match either "should i choose" or "choose equipment"
    expect(['should i choose', 'choose equipment']).toContain(result.matched_keywords[0]);
  });

  it('should route "recommend best combination" to EQUIPMENT_OPTIMIZATION', () => {
    const result = normalizeUserQuery('recommend best combination of equipment');
    
    expect(result.intent).toBe('EQUIPMENT_OPTIMIZATION');
    expect(result.matched_keywords).toContain('best combination');
  });

  it('should route "help me select equipment" to EQUIPMENT_OPTIMIZATION', () => {
    const result = normalizeUserQuery('help me select equipment for mining');
    
    expect(result.intent).toBe('EQUIPMENT_OPTIMIZATION');
    expect(result.matched_keywords).toContain('help me select');
  });

  it('should route "which tippers should I pick" to EQUIPMENT_OPTIMIZATION (not COMBINATION)', () => {
    const result = normalizeUserQuery('which tippers should I pick for the most efficient combo');
    
    expect(result.intent).toBe('EQUIPMENT_OPTIMIZATION');
    expect(result.intent).not.toBe('EQUIPMENT_COMBINATION');
    // Should match optimization keywords, not just "which tippers"
  });

  it('should route "which excavator should I choose" to EQUIPMENT_OPTIMIZATION', () => {
    const result = normalizeUserQuery('which excavator should I choose for this task');
    
    expect(result.intent).toBe('EQUIPMENT_OPTIMIZATION');
  });

  it('should distinguish optimization from data queries based on context', () => {
    // Data query - which equipment DID something (past tense, data retrieval)
    const dataQuery = normalizeUserQuery('which tippers made the most trips');
    expect(dataQuery.intent).toBe('EQUIPMENT_COMBINATION');
    
    // Optimization query - which equipment SHOULD I use (recommendation)
    const optQuery = normalizeUserQuery('which tippers should I use for this project');
    expect(optQuery.intent).toBe('EQUIPMENT_OPTIMIZATION');
  });
});
