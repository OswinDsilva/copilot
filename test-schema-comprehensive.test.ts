import { describe, it, expect } from 'vitest';
import { executeSQL } from './src/router/services/database';

describe('Schema Validation - Comprehensive Column Tests', () => {
  it('should NOT flag valid SQL with EXTRACT(MONTH FROM date)', async () => {
    const sql = "SELECT date, shift, qty_ton FROM production_summary WHERE EXTRACT(MONTH FROM date) = 1";
    
    const result = await executeSQL(sql);
    
    console.log('\nTest: EXTRACT(MONTH FROM date)');
    console.log('SQL:', sql);
    console.log('Success:', result.success);
    if (!result.success) {
      console.log('Error:', result.error);
    }
    
    // Should NOT complain about 'F' or 'MONTH' being invalid columns
    expect(result.success).toBe(true);
  });

  it('should NOT flag valid SQL with EXTRACT(YEAR FROM date)', async () => {
    const sql = "SELECT date, shift, excavator FROM production_summary WHERE EXTRACT(YEAR FROM date) = 2025";
    
    const result = await executeSQL(sql);
    
    console.log('\nTest: EXTRACT(YEAR FROM date)');
    console.log('SQL:', sql);
    console.log('Success:', result.success);
    if (!result.success) {
      console.log('Error:', result.error);
    }
    
    expect(result.success).toBe(true);
  });

  it('should NOT flag valid SQL with DATE_TRUNC', async () => {
    const sql = "SELECT DATE_TRUNC('day', date) as day, SUM(qty_ton) FROM production_summary GROUP BY day";
    
    const result = await executeSQL(sql);
    
    console.log('\nTest: DATE_TRUNC');
    console.log('SQL:', sql);
    console.log('Success:', result.success);
    if (!result.success) {
      console.log('Error:', result.error);
    }
    
    expect(result.success).toBe(true);
  });

  it('should NOT flag valid SQL with CAST function', async () => {
    const sql = "SELECT CAST(qty_ton AS INTEGER) as tons FROM production_summary LIMIT 5";
    
    const result = await executeSQL(sql);
    
    console.log('\nTest: CAST function');
    console.log('SQL:', sql);
    console.log('Success:', result.success);
    if (!result.success) {
      console.log('Error:', result.error);
    }
    
    expect(result.success).toBe(true);
  });

  it('should flag actual invalid column names', async () => {
    const sql = "SELECT date, shift, invalid_column_xyz FROM production_summary";
    
    const result = await executeSQL(sql);
    
    console.log('\nTest: Invalid column name');
    console.log('SQL:', sql);
    console.log('Success:', result.success);
    console.log('Error:', result.error);
    
    // Should reject invalid columns
    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid_column_xyz');
  });

  it('should auto-fix common column mistakes', async () => {
    const sql = "SELECT date, shift, tonnage FROM production_summary WHERE date = '2025-01-15'";
    
    const result = await executeSQL(sql);
    
    console.log('\nTest: Auto-fix tonnage → qty_ton');
    console.log('SQL:', sql);
    console.log('Success:', result.success);
    if (!result.success) {
      console.log('Error:', result.error);
    }
    
    // Should auto-fix 'tonnage' to 'qty_ton'
    expect(result.success).toBe(true);
  });

  it('should handle complex queries with multiple functions', async () => {
    const sql = `
      SELECT 
        DATE_TRUNC('month', date) as month,
        shift,
        SUM(qty_ton) as total_tons,
        COUNT(*) as record_count
      FROM production_summary 
      WHERE EXTRACT(YEAR FROM date) = 2025 
        AND EXTRACT(MONTH FROM date) = 1
      GROUP BY month, shift
      ORDER BY month, shift
    `;
    
    const result = await executeSQL(sql);
    
    console.log('\nTest: Complex query with multiple functions');
    console.log('SQL:', sql.replace(/\s+/g, ' ').trim());
    console.log('Success:', result.success);
    if (!result.success) {
      console.log('Error:', result.error);
    }
    
    // Should NOT flag MONTH, YEAR, etc. as invalid columns
    expect(result.success).toBe(true);
  });
});
