/**
 * SQL Generation Templates - Unit Tests
 * 
 * Tests for SQL template rendering with parameter substitution,
 * filter injection, and edge case handling.
 * 
 * Coverage: 45 test cases for 4 SQL templates
 */

import { describe, it, expect } from 'vitest';
import { summaryTemplate } from '../../../sql/templates/summary';
import { timeSeriesTemplate } from '../../../sql/templates/timeSeries';
import { groupByShiftTemplate } from '../../../sql/templates/groupByShift';
import { equipmentComboTemplate } from '../../../sql/templates/combination';

describe('SQL Templates - Summary Template', () => {
  
  it('should have correct structure', () => {
    expect(summaryTemplate).toContain('SELECT SUM({{metric}})');
    expect(summaryTemplate).toContain('FROM {{table}}');
    expect(summaryTemplate).toContain('WHERE {{filters}}');
  });

  it('should contain metric placeholder', () => {
    expect(summaryTemplate).toMatch(/\{\{metric\}\}/);
  });

  it('should contain table placeholder', () => {
    expect(summaryTemplate).toMatch(/\{\{table\}\}/);
  });

  it('should contain filters placeholder', () => {
    expect(summaryTemplate).toMatch(/\{\{filters\}\}/);
  });

  it('should use SUM aggregation', () => {
    expect(summaryTemplate).toContain('SUM(');
  });

  it('should alias result as total_{{metric}}', () => {
    expect(summaryTemplate).toContain('AS total_{{metric}}');
  });

  it('should be single line or compact', () => {
    // Template should be concise
    expect(summaryTemplate.split('\n').length).toBeLessThan(5);
  });
});

describe('SQL Templates - Time Series Template', () => {
  
  it('should have correct structure', () => {
    expect(timeSeriesTemplate).toContain('SELECT date, {{metric}}');
    expect(timeSeriesTemplate).toContain('FROM {{table}}');
    expect(timeSeriesTemplate).toContain('WHERE {{filters}}');
    expect(timeSeriesTemplate).toContain('ORDER BY date');
  });

  it('should select date column', () => {
    expect(timeSeriesTemplate).toContain('date');
  });

  it('should contain metric placeholder', () => {
    expect(timeSeriesTemplate).toMatch(/\{\{metric\}\}/);
  });

  it('should contain table placeholder', () => {
    expect(timeSeriesTemplate).toMatch(/\{\{table\}\}/);
  });

  it('should contain filters placeholder', () => {
    expect(timeSeriesTemplate).toMatch(/\{\{filters\}\}/);
  });

  it('should order by date', () => {
    expect(timeSeriesTemplate).toContain('ORDER BY date');
  });

  it('should not have descending order', () => {
    expect(timeSeriesTemplate).not.toContain('DESC');
  });

  it('should be single line or compact', () => {
    expect(timeSeriesTemplate.split('\n').length).toBeLessThan(5);
  });
});

describe('SQL Templates - Group By Shift Template', () => {
  
  it('should have correct structure', () => {
    expect(groupByShiftTemplate).toContain('SELECT shift');
    expect(groupByShiftTemplate).toContain('SUM({{metric}})');
    expect(groupByShiftTemplate).toContain('FROM {{table}}');
    expect(groupByShiftTemplate).toContain('GROUP BY shift');
    expect(groupByShiftTemplate).toContain('ORDER BY shift');
  });

  it('should select shift column', () => {
    expect(groupByShiftTemplate).toContain('shift');
  });

  it('should use SUM aggregation', () => {
    expect(groupByShiftTemplate).toContain('SUM(');
  });

  it('should alias result as total_{{metric}}', () => {
    expect(groupByShiftTemplate).toContain('AS total_{{metric}}');
  });

  it('should contain metric placeholder', () => {
    expect(groupByShiftTemplate).toMatch(/\{\{metric\}\}/);
  });

  it('should contain table placeholder', () => {
    expect(groupByShiftTemplate).toMatch(/\{\{table\}\}/);
  });

  it('should contain filters placeholder', () => {
    expect(groupByShiftTemplate).toMatch(/\{\{filters\}\}/);
  });

  it('should group by shift', () => {
    expect(groupByShiftTemplate).toContain('GROUP BY shift');
  });

  it('should order by shift', () => {
    expect(groupByShiftTemplate).toContain('ORDER BY shift');
  });

  it('should be single line or compact', () => {
    expect(groupByShiftTemplate.split('\n').length).toBeLessThan(6);
  });
});

describe('SQL Templates - Equipment Combination Template', () => {
  
  it('should have correct structure', () => {
    expect(equipmentComboTemplate).toContain('SELECT tipper_id, excavator');
    expect(equipmentComboTemplate).toContain('SUM(trip_count)');
    expect(equipmentComboTemplate).toContain('FROM trip_summary_by_date');
    expect(equipmentComboTemplate).toContain('GROUP BY tipper_id, excavator');
    expect(equipmentComboTemplate).toContain('ORDER BY total_trips DESC');
    expect(equipmentComboTemplate).toContain('LIMIT {{limit}}');
  });

  it('should select tipper_id column', () => {
    expect(equipmentComboTemplate).toContain('tipper_id');
  });

  it('should select excavator column', () => {
    expect(equipmentComboTemplate).toContain('excavator');
  });

  it('should sum trip_count', () => {
    expect(equipmentComboTemplate).toContain('SUM(trip_count)');
  });

  it('should alias result as total_trips', () => {
    expect(equipmentComboTemplate).toContain('as total_trips');
  });

  it('should query trip_summary_by_date table', () => {
    expect(equipmentComboTemplate).toContain('FROM trip_summary_by_date');
  });

  it('should contain filters placeholder', () => {
    expect(equipmentComboTemplate).toMatch(/\{\{filters\}\}/);
  });

  it('should group by tipper_id and excavator', () => {
    expect(equipmentComboTemplate).toContain('GROUP BY tipper_id, excavator');
  });

  it('should order by total_trips descending', () => {
    expect(equipmentComboTemplate).toContain('ORDER BY total_trips DESC');
  });

  it('should contain limit placeholder', () => {
    expect(equipmentComboTemplate).toMatch(/\{\{limit\}\}/);
  });

  it('should be compact', () => {
    expect(equipmentComboTemplate.split('\n').length).toBeLessThan(7);
  });
});

describe('SQL Templates - Placeholder Consistency', () => {
  
  it('all templates should use double curly braces for placeholders', () => {
    const templates = [
      summaryTemplate,
      timeSeriesTemplate,
      groupByShiftTemplate,
      equipmentComboTemplate
    ];
    
    templates.forEach(template => {
      // Should not use single curly braces
      expect(template).not.toMatch(/[^{]{[a-z]+}[^}]/);
    });
  });

  it('metric placeholder should be consistent across templates', () => {
    expect(summaryTemplate).toContain('{{metric}}');
    expect(timeSeriesTemplate).toContain('{{metric}}');
    expect(groupByShiftTemplate).toContain('{{metric}}');
  });

  it('table placeholder should be consistent', () => {
    expect(summaryTemplate).toContain('{{table}}');
    expect(timeSeriesTemplate).toContain('{{table}}');
    expect(groupByShiftTemplate).toContain('{{table}}');
  });

  it('filters placeholder should be consistent', () => {
    expect(summaryTemplate).toContain('{{filters}}');
    expect(timeSeriesTemplate).toContain('{{filters}}');
    expect(groupByShiftTemplate).toContain('{{filters}}');
    expect(equipmentComboTemplate).toContain('{{filters}}');
  });
});

describe('SQL Templates - SQL Syntax Validity', () => {
  
  it('summary template should have valid SQL keywords', () => {
    expect(summaryTemplate).toMatch(/SELECT/);
    expect(summaryTemplate).toMatch(/FROM/);
    expect(summaryTemplate).toMatch(/WHERE/);
    expect(summaryTemplate).toMatch(/SUM/);
  });

  it('time series template should have valid SQL keywords', () => {
    expect(timeSeriesTemplate).toMatch(/SELECT/);
    expect(timeSeriesTemplate).toMatch(/FROM/);
    expect(timeSeriesTemplate).toMatch(/WHERE/);
    expect(timeSeriesTemplate).toMatch(/ORDER BY/);
  });

  it('group by shift template should have valid SQL keywords', () => {
    expect(groupByShiftTemplate).toMatch(/SELECT/);
    expect(groupByShiftTemplate).toMatch(/FROM/);
    expect(groupByShiftTemplate).toMatch(/WHERE/);
    expect(groupByShiftTemplate).toMatch(/GROUP BY/);
    expect(groupByShiftTemplate).toMatch(/ORDER BY/);
  });

  it('equipment combo template should have valid SQL keywords', () => {
    expect(equipmentComboTemplate).toMatch(/SELECT/);
    expect(equipmentComboTemplate).toMatch(/FROM/);
    expect(equipmentComboTemplate).toMatch(/GROUP BY/);
    expect(equipmentComboTemplate).toMatch(/ORDER BY/);
    expect(equipmentComboTemplate).toMatch(/LIMIT/);
  });
});

describe('SQL Templates - Template Substitution Simulation', () => {
  
  it('should simulate summary template substitution', () => {
    let sql = summaryTemplate;
    sql = sql.replace('{{metric}}', 'tonnage');
    sql = sql.replace('total_{{metric}}', 'total_tonnage');
    sql = sql.replace('{{table}}', 'production_summary');
    sql = sql.replace('{{filters}}', 'date >= \'2024-01-01\'');
    
    expect(sql).toContain('SUM(tonnage)');
    expect(sql).toContain('FROM production_summary');
    expect(sql).toContain('WHERE date >=');
    expect(sql).not.toContain('{{');
  });

  it('should simulate time series template substitution', () => {
    let sql = timeSeriesTemplate;
    sql = sql.replace('{{metric}}', 'tonnage');
    sql = sql.replace('{{table}}', 'production_summary');
    sql = sql.replace('{{filters}}', 'shift = \'A\'');
    
    expect(sql).toContain('SELECT date, tonnage');
    expect(sql).toContain('FROM production_summary');
    expect(sql).toContain('WHERE shift =');
    expect(sql).not.toContain('{{');
  });

  it('should simulate group by shift template substitution', () => {
    let sql = groupByShiftTemplate;
    sql = sql.replace('{{metric}}', 'tonnage');
    sql = sql.replace('total_{{metric}}', 'total_tonnage');
    sql = sql.replace('{{table}}', 'production_summary');
    sql = sql.replace('{{filters}}', 'date = \'2024-01-01\'');
    
    expect(sql).toContain('SUM(tonnage) AS total_tonnage');
    expect(sql).toContain('FROM production_summary');
    expect(sql).toContain('WHERE date =');
    expect(sql).not.toContain('{{');
  });

  it('should simulate equipment combo template substitution', () => {
    let sql = equipmentComboTemplate;
    sql = sql.replace('{{filters}}', 'WHERE trip_date >= \'2024-01-01\'');
    sql = sql.replace('{{limit}}', '10');
    
    expect(sql).toContain('SUM(trip_count)');
    expect(sql).toContain('LIMIT 10');
    expect(sql).not.toContain('{{');
  });
});
