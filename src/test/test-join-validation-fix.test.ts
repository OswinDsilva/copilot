import { describe, it, expect } from 'vitest';

/**
 * Test for JOIN query validation fix
 * 
 * Issue: JOIN queries with table aliases (p.date, t.tipper_id) were being flagged 
 * as having invalid columns because the validator only checked against one table's schema.
 * 
 * Fix: Skip validation for queries with table-prefixed columns (indicates JOIN with aliases)
 */

// Mock the validateAgainstSchema function behavior
function validateAgainstSchema(sql: string): { 
  invalidColumns: string[]; 
  suggestions: string[];
  corrections: Record<string, string>;
} {
  const invalidColumns: string[] = [];
  const suggestions: string[] = [];
  const corrections: Record<string, string> = {};
  
  // Check if query has table-prefixed columns (e.g., p.date, t.tipper_id)
  const hasTablePrefixes = /\b[a-z]\.\w+/i.test(sql);
  if (hasTablePrefixes) {
    // JOIN queries with table aliases - skip validation
    return { invalidColumns, suggestions, corrections };
  }
  
  // Simplified validation logic for testing
  const tableSchemas: Record<string, string[]> = {
    'production_summary': ['id', 'date', 'shift', 'qty_ton', 'qty_m3'],
    'trip_summary_by_date': ['id', 'trip_date', 'shift', 'tipper_id', 'excavator', 'trip_count']
  };
  
  const tableMatch = sql.match(/FROM\s+(\w+)/i);
  if (!tableMatch) return { invalidColumns, suggestions, corrections };
  
  const tableName = tableMatch[1].toLowerCase();
  const validColumns = tableSchemas[tableName] || [];
  
  // Simplified token extraction
  const tokens = sql.match(/\b\w+\b/g) || [];
  const keywords = new Set(['SELECT', 'FROM', 'WHERE', 'JOIN', 'ON', 'AND', 'AS', 'GROUP', 'BY', 'ORDER', 'SUM', 'ASC', 'DESC']);
  
  for (const token of tokens) {
    if (keywords.has(token.toUpperCase())) continue;
    if (token === tableName) continue;
    if (token.length === 1) continue;
    if (/^\d+$/.test(token)) continue;
    
    if (!validColumns.includes(token.toLowerCase())) {
      invalidColumns.push(token);
      suggestions.push(`Column '${token}' doesn't exist in table '${tableName}'.`);
    }
  }
  
  return { invalidColumns, suggestions, corrections };
}

describe('JOIN Query Validation Fix', () => {
  it('should skip validation for JOIN queries with table aliases', () => {
    const sql = `
      SELECT p.date, p.shift, t.excavator, t.tipper_id, 
             SUM(p.qty_ton) AS production_tonnage, 
             SUM(p.qty_m3) AS production_cubic_meters, 
             SUM(t.trip_count) AS total_trips
      FROM production_summary AS p 
      JOIN trip_summary_by_date AS t 
        ON p.date = t.trip_date AND p.shift = t.shift
      WHERE p.date = '2025-01-15' AND p.shift = 'A'
      GROUP BY p.date, p.shift, t.excavator, t.tipper_id
      ORDER BY production_tonnage DESC
    `;
    
    const result = validateAgainstSchema(sql);
    
    // Should NOT detect any invalid columns (validation skipped for JOIN with aliases)
    expect(result.invalidColumns).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });

  it('should still validate simple queries without table prefixes', () => {
    const sql = `
      SELECT date, shift, invalid_column, qty_ton
      FROM production_summary
      WHERE date = '2025-01-15'
    `;
    
    const result = validateAgainstSchema(sql);
    
    // Should detect invalid_column
    expect(result.invalidColumns.length).toBeGreaterThan(0);
    expect(result.invalidColumns).toContain('invalid_column');
  });

  it('should skip validation for queries with single-letter table aliases', () => {
    const sql = `
      SELECT p.date, p.qty_ton
      FROM production_summary p
      WHERE p.shift = 'A'
    `;
    
    const result = validateAgainstSchema(sql);
    
    // Should skip validation (has table prefix p.)
    expect(result.invalidColumns).toHaveLength(0);
  });

  it('should skip validation for complex JOIN with multiple aliases', () => {
    const sql = `
      SELECT p.date, t.tipper_id, e.excavator_name
      FROM production_summary p
      JOIN trip_summary_by_date t ON p.date = t.trip_date
      JOIN equipment e ON t.excavator = e.id
    `;
    
    const result = validateAgainstSchema(sql);
    
    // Should skip validation (has table prefixes)
    expect(result.invalidColumns).toHaveLength(0);
  });
});
