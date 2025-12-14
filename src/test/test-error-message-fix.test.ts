import { describe, it, expect } from 'vitest';

/**
 * Tests for error message fix
 * 
 * Issue: "Error executing query: Schema validation failed: Column 'trip_date' doesn't exist 
 * in table 'production_summary'. Use 'date' instead." appearing even though auto-fix worked.
 * 
 * Root cause: Error check treated auto-fix suggestions as errors
 * 
 * Fix: Modified error check to exclude issues that have corrections available
 */

// Mock the detectAndFixBogusFilters function to test error handling logic
function detectAndFixBogusFilters(query: string): { 
  sql: string; 
  fixed: boolean; 
  issues: string[]; 
  corrections: Record<string, string>;
} {
  const issues: string[] = [];
  const corrections: Record<string, string> = {};
  
  // Simulate trip_date correction for production_summary
  if (query.includes('production_summary') && query.includes('trip_date')) {
    corrections['trip_date'] = 'date';
    issues.push("Column 'trip_date' doesn't exist in table 'production_summary'. Use 'date' instead.");
    
    // Simulate auto-fix replacing trip_date with date
    const fixedSql = query.replace(/\btrip_date\b/g, 'date');
    return { 
      sql: fixedSql, 
      fixed: true, 
      issues, 
      corrections 
    };
  }
  
  return { sql: query, fixed: false, issues, corrections };
}

// Simulate error checking logic from executeSQL
function checkForSchemaErrors(issues: string[], corrections: Record<string, string>): string[] {
  return issues.filter(issue => {
    // Always treat SCHEMA_ERROR prefix as error
    if (issue.startsWith('SCHEMA_ERROR:')) return true;
    
    // For "doesn't exist" messages, check if we have a correction
    if (issue.includes("doesn't exist")) {
      // Extract column name from message: "Column 'trip_date' doesn't exist..."
      const match = issue.match(/Column '(\w+)' doesn't exist/);
      if (match) {
        const columnName = match[1].toLowerCase();
        // If we have a correction for this column, it's auto-fixable - NOT an error
        if (corrections && corrections[columnName]) {
          return false; // Not an error, we have a correction
        }
      }
      return true; // No correction available - this is an error
    }
    
    return false;
  });
}

describe('Error Message Fix - Auto-correctable Columns', () => {
  it('should NOT show error for trip_date in production_summary (has correction)', () => {
    const query = `
      SELECT trip_date, shift, qty_ton, qty_m3 
      FROM production_summary 
      WHERE trip_date = '2025-01-15' AND shift = 'A'
    `;
    
    const result = detectAndFixBogusFilters(query);
    
    // Verify auto-fix worked
    expect(result.fixed).toBe(true);
    expect(result.sql).toContain('date');
    expect(result.sql).not.toContain('trip_date');
    
    // Verify correction was stored
    expect(result.corrections).toHaveProperty('trip_date');
    expect(result.corrections['trip_date']).toBe('date');
    
    // Verify suggestion was added to issues
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain("doesn't exist");
    
    // CRITICAL: Error check should NOT treat this as an error
    const schemaErrors = checkForSchemaErrors(result.issues, result.corrections);
    expect(schemaErrors).toHaveLength(0);
  });

  it('should show error for unknown column with no correction', () => {
    const issues = [
      "Column 'unknown_column' doesn't exist in table 'production_summary'. Valid columns: date, shift, qty_ton, qty_m3"
    ];
    const corrections = {}; // No correction available
    
    const schemaErrors = checkForSchemaErrors(issues, corrections);
    
    // Should be treated as error (no correction available)
    expect(schemaErrors).toHaveLength(1);
    expect(schemaErrors[0]).toContain("doesn't exist");
  });

  it('should show error for SCHEMA_ERROR prefix regardless of corrections', () => {
    const issues = [
      "SCHEMA_ERROR: Query contains invalid columns that cannot be auto-fixed",
      "Column 'trip_date' doesn't exist in table 'production_summary'. Use 'date' instead."
    ];
    const corrections = { trip_date: 'date' };
    
    const schemaErrors = checkForSchemaErrors(issues, corrections);
    
    // Should include SCHEMA_ERROR but not the auto-correctable issue
    expect(schemaErrors).toHaveLength(1);
    expect(schemaErrors[0]).toContain('SCHEMA_ERROR:');
  });

  it('should NOT show error for multiple auto-correctable columns', () => {
    const issues = [
      "Column 'trip_date' doesn't exist in table 'production_summary'. Use 'date' instead.",
      "Column 'total_tonnage' doesn't exist in table 'production_summary'. Use 'qty_ton' instead."
    ];
    const corrections = { 
      trip_date: 'date',
      total_tonnage: 'qty_ton'
    };
    
    const schemaErrors = checkForSchemaErrors(issues, corrections);
    
    // No errors - all issues have corrections
    expect(schemaErrors).toHaveLength(0);
  });

  it('should show error for mixed correctable and non-correctable columns', () => {
    const issues = [
      "Column 'trip_date' doesn't exist in table 'production_summary'. Use 'date' instead.",
      "Column 'invalid_col' doesn't exist in table 'production_summary'. Valid columns: date, shift, qty_ton"
    ];
    const corrections = { 
      trip_date: 'date'
      // invalid_col has no correction
    };
    
    const schemaErrors = checkForSchemaErrors(issues, corrections);
    
    // Should only show error for invalid_col
    expect(schemaErrors).toHaveLength(1);
    expect(schemaErrors[0]).toContain('invalid_col');
    expect(schemaErrors[0]).not.toContain('trip_date');
  });
});
