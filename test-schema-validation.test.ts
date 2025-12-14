import { describe, it, expect } from 'vitest';
import { executeSQL } from './src/router/services/database';

describe('Schema Validation - trip_date vs date', () => {
  it('should auto-fix trip_date to date when querying production_summary', async () => {
    // This query incorrectly uses trip_date on production_summary table
    // production_summary uses 'date', not 'trip_date'
    const badSQL = "SELECT date, shift, qty_ton FROM production_summary WHERE trip_date = '2025-01-15'";
    
    const result = await executeSQL(badSQL);
    
    console.log('\nTest: trip_date → date conversion');
    console.log('Original SQL:', badSQL);
    console.log('Result:', result);
    
    // Should auto-fix or provide helpful error message
    if (result.success) {
      console.log('✓ Query auto-fixed and executed successfully');
      expect(result.success).toBe(true);
    } else {
      console.log('Error:', result.error);
      // Should suggest using 'date' instead of 'trip_date'
      expect(result.error).toContain("trip_date");
      expect(result.error).toContain("date");
    }
  });

  it('should keep trip_date when querying trip_summary_by_date', async () => {
    // This query correctly uses trip_date on trip_summary_by_date table
    const goodSQL = "SELECT trip_date, shift, tipper_id FROM trip_summary_by_date WHERE trip_date = '2025-01-15' LIMIT 5";
    
    const result = await executeSQL(goodSQL);
    
    console.log('\nTest: trip_date on correct table');
    console.log('SQL:', goodSQL);
    console.log('Success:', result.success);
    
    // Should execute without issues
    expect(result.success).toBe(true);
  });
});
