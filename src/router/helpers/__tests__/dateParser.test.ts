/**
 * Date Parser - Unit Tests
 * 
 * Comprehensive tests for all 8 date parsing functions covering:
 * - Quarter parsing (Q1-Q4, written forms)
 * - Relative dates (last month, this year, last N days)
 * - Month parsing (full names, abbreviations)
 * - Date ranges (from...to, between...and)
 * - Year extraction
 * - SQL filter generation
 * - Edge cases and boundaries
 * 
 * Current date for testing: 2025-11-14 (November 14, 2025)
 */

import { describe, it, expect } from 'vitest';
import {
  parseQuarter,
  parseRelativeDate,
  parseMonth,
  parseDateRange,
  parseYear,
  parseDate,
  dateToSQLFilter,
  getQuarterDateRange,
} from '../dateParser';

describe('Date Parser - parseQuarter', () => {
  describe('Q-format parsing (Q1, Q2, Q3, Q4)', () => {
    it('should parse Q1 2024', () => {
      const result = parseQuarter('Q1 2024');
      expect(result).toBeDefined();
      expect(result?.type).toBe('quarter');
      expect(result?.quarter).toBe(1);
      expect(result?.year).toBe(2024);
      expect(result?.startDate).toBe('2024-01-01');
      expect(result?.endDate).toBe('2024-03-31');
    });

    it('should parse Q2 2023', () => {
      const result = parseQuarter('Q2 2023');
      expect(result?.quarter).toBe(2);
      expect(result?.year).toBe(2023);
      expect(result?.startDate).toBe('2023-04-01');
      expect(result?.endDate).toBe('2023-06-30');
    });

    it('should parse Q3 without year (use current year 2025)', () => {
      const result = parseQuarter('Q3');
      expect(result?.quarter).toBe(3);
      expect(result?.year).toBe(2025); // Current year
      expect(result?.startDate).toBe('2025-07-01');
      expect(result?.endDate).toBe('2025-09-30');
    });

    it('should parse Q4 2025', () => {
      const result = parseQuarter('Q4 2025');
      expect(result?.quarter).toBe(4);
      expect(result?.year).toBe(2025);
      expect(result?.startDate).toBe('2025-10-01');
      expect(result?.endDate).toBe('2025-12-31');
    });
  });

  describe('Written format parsing (first quarter, second quarter, etc.)', () => {
    it('should parse "first quarter of 2024"', () => {
      const result = parseQuarter('first quarter of 2024');
      expect(result?.quarter).toBe(1);
      expect(result?.year).toBe(2024);
      expect(result?.startDate).toBe('2024-01-01');
      expect(result?.endDate).toBe('2024-03-31');
    });

    it('should parse "second quarter of 2023"', () => {
      const result = parseQuarter('second quarter of 2023');
      expect(result?.quarter).toBe(2);
      expect(result?.year).toBe(2023);
    });

    it('should parse "third quarter 2024" (without of)', () => {
      const result = parseQuarter('third quarter 2024');
      expect(result?.quarter).toBe(3);
      expect(result?.year).toBe(2024);
    });

    it('should parse "fourth quarter" (without year)', () => {
      const result = parseQuarter('fourth quarter');
      expect(result?.quarter).toBe(4);
      expect(result?.year).toBe(2025); // Current year
    });
  });

  describe('Edge cases and invalid input', () => {
    it('should return null for invalid quarter number (Q0)', () => {
      const result = parseQuarter('Q0 2024');
      expect(result).toBeNull();
    });

    it('should return null for invalid quarter number (Q5)', () => {
      const result = parseQuarter('Q5 2024');
      expect(result).toBeNull();
    });

    it('should return null for non-quarter strings', () => {
      const result = parseQuarter('not a quarter');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseQuarter('');
      expect(result).toBeNull();
    });
  });

  describe('Date range validation', () => {
    it('should have valid ISO format dates for Q1', () => {
      const result = parseQuarter('Q1 2024');
      expect(result?.startDate).toBeDefined();
      expect(result?.endDate).toBeDefined();
      expect(result?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result?.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('Q1 should span Jan 1 to Mar 31', () => {
      const result = parseQuarter('Q1 2024');
      expect(result?.startDate).toBe('2024-01-01');
      expect(result?.endDate).toBe('2024-03-31');
    });

    it('Q2 should span Apr 1 to Jun 30', () => {
      const result = parseQuarter('Q2 2024');
      expect(result?.startDate).toBe('2024-04-01');
      expect(result?.endDate).toBe('2024-06-30');
    });

    it('Q3 should span Jul 1 to Sep 30', () => {
      const result = parseQuarter('Q3 2024');
      expect(result?.startDate).toBe('2024-07-01');
      expect(result?.endDate).toBe('2024-09-30');
    });

    it('Q4 should span Oct 1 to Dec 31', () => {
      const result = parseQuarter('Q4 2024');
      expect(result?.startDate).toBe('2024-10-01');
      expect(result?.endDate).toBe('2024-12-31');
    });
  });

  describe('Leap year handling', () => {
    it('should handle Q1 in leap year 2024 (Feb has 29 days)', () => {
      const result = parseQuarter('Q1 2024');
      // Q1 ends on March 31, not affected by leap year
      expect(result?.endDate).toBe('2024-03-31');
    });

    it('should handle Q1 in non-leap year 2023 (Feb has 28 days)', () => {
      const result = parseQuarter('Q1 2023');
      // Q1 ends on March 31 regardless
      expect(result?.endDate).toBe('2023-03-31');
    });
  });
});

describe('Date Parser - parseRelativeDate', () => {
  describe('Last period expressions', () => {
    it('should parse "last month"', () => {
      const result = parseRelativeDate('last month');
      expect(result).toBeDefined();
      expect(result?.type).toBe('range');
      expect(result?.relativePeriod).toBe('last_month');
      // Last month from 2025-11-14 is October 2025
      expect(result?.startDate).toBe('2025-10-01');
      expect(result?.endDate).toBe('2025-10-31');
      expect(result?.year).toBe(2025);
      expect(result?.month).toBe(10);
    });

    it('should parse "last week"', () => {
      const result = parseRelativeDate('last week');
      expect(result?.type).toBe('range');
      expect(result?.relativePeriod).toBe('last_week');
      expect(result?.startDate).toBeDefined();
      expect(result?.endDate).toBeDefined();
    });

    it('should parse "last year"', () => {
      const result = parseRelativeDate('last year');
      expect(result?.type).toBe('year');
      expect(result?.relativePeriod).toBe('last_year');
      expect(result?.year).toBe(2024);
      expect(result?.startDate).toBe('2024-01-01');
      expect(result?.endDate).toBe('2024-12-31');
    });
  });

  describe('This period expressions', () => {
    it('should parse "this month"', () => {
      const result = parseRelativeDate('this month');
      expect(result?.type).toBe('range');
      expect(result?.relativePeriod).toBe('this_month');
      // Current month is November 2025
      expect(result?.startDate).toBe('2025-11-01');
      expect(result?.endDate).toBe('2025-11-30');
      expect(result?.year).toBe(2025);
      expect(result?.month).toBe(11);
    });

    it('should parse "this year"', () => {
      const result = parseRelativeDate('this year');
      expect(result?.type).toBe('year');
      expect(result?.relativePeriod).toBe('this_year');
      expect(result?.year).toBe(2025);
      expect(result?.startDate).toBe('2025-01-01');
      expect(result?.endDate).toBe('2025-12-31');
    });

    it('should parse "this week"', () => {
      const result = parseRelativeDate('this week');
      expect(result?.type).toBe('range');
      expect(result?.relativePeriod).toBe('this_week');
      expect(result?.startDate).toBeDefined();
      expect(result?.endDate).toBeDefined();
    });
  });

  describe('Last N days expressions', () => {
    it('should parse "last 7 days"', () => {
      const result = parseRelativeDate('last 7 days');
      expect(result?.type).toBe('range');
      expect(result?.relativePeriod).toBe('last_7_days');
      expect(result?.startDate).toBeDefined();
      expect(result?.endDate).toBeDefined();
    });

    it('should parse "last 30 days"', () => {
      const result = parseRelativeDate('last 30 days');
      expect(result?.type).toBe('range');
      expect(result?.relativePeriod).toBe('last_30_days');
      expect(result?.startDate).toBeDefined();
      expect(result?.endDate).toBeDefined();
    });

    it('should parse "last 45 days"', () => {
      const result = parseRelativeDate('last 45 days');
      expect(result?.type).toBe('range');
      expect(result?.relativePeriod).toBe('last_45_days');
      expect(result?.startDate).toBeDefined();
      expect(result?.endDate).toBeDefined();
    });

    it('should parse "last 90 days"', () => {
      const result = parseRelativeDate('last 90 days');
      expect(result?.type).toBe('range');
      expect(result?.relativePeriod).toBe('last_90_days');
      expect(result?.startDate).toBeDefined();
      expect(result?.endDate).toBeDefined();
    });
  });

  describe('Single day expressions', () => {
    it('should parse "today"', () => {
      const result = parseRelativeDate('today');
      expect(result?.type).toBe('single');
      expect(result?.relativePeriod).toBe('today');
      expect(result?.startDate).toBe('2025-11-14');
      expect(result?.endDate).toBe('2025-11-14');
    });

    it('should parse "yesterday"', () => {
      const result = parseRelativeDate('yesterday');
      expect(result?.type).toBe('single');
      expect(result?.relativePeriod).toBe('yesterday');
      expect(result?.startDate).toBe('2025-11-13');
      expect(result?.endDate).toBe('2025-11-13');
    });
  });

  describe('Edge cases', () => {
    it('should return null for invalid relative date', () => {
      const result = parseRelativeDate('not a date');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseRelativeDate('');
      expect(result).toBeNull();
    });
  });
});

describe('Date Parser - parseMonth', () => {
  describe('Full month names with year', () => {
    it('should parse "January 2024"', () => {
      const result = parseMonth('January 2024');
      expect(result).toBeDefined();
      expect(result?.type).toBe('month');
      expect(result?.month).toBe(1);
      expect(result?.monthName).toBe('january');
      expect(result?.year).toBe(2024);
      expect(result?.startDate).toBe('2024-01-01');
      expect(result?.endDate).toBe('2024-01-31');
    });

    it('should parse "February 2024" (leap year)', () => {
      const result = parseMonth('February 2024');
      expect(result?.month).toBe(2);
      expect(result?.year).toBe(2024);
      expect(result?.startDate).toBe('2024-02-01');
      expect(result?.endDate).toBe('2024-02-29'); // Leap year!
    });

    it('should parse "February 2023" (non-leap year)', () => {
      const result = parseMonth('February 2023');
      expect(result?.month).toBe(2);
      expect(result?.year).toBe(2023);
      expect(result?.endDate).toBe('2023-02-28'); // Not a leap year
    });

    it('should parse "December 2025"', () => {
      const result = parseMonth('December 2025');
      expect(result?.month).toBe(12);
      expect(result?.year).toBe(2025);
      expect(result?.endDate).toBe('2025-12-31');
    });
  });

  describe('Abbreviated month names', () => {
    it('should parse "Jan 2024"', () => {
      const result = parseMonth('Jan 2024');
      expect(result?.month).toBe(1);
      expect(result?.monthName).toBe('january');
      expect(result?.year).toBe(2024);
    });

    it('should parse "Feb 2024"', () => {
      const result = parseMonth('Feb 2024');
      expect(result?.month).toBe(2);
      expect(result?.year).toBe(2024);
    });

    it('should parse "Dec 2024"', () => {
      const result = parseMonth('Dec 2024');
      expect(result?.month).toBe(12);
      expect(result?.year).toBe(2024);
    });
  });

  describe('Month without year (use current year)', () => {
    it('should parse "January" and use current year (2025)', () => {
      const result = parseMonth('January');
      expect(result?.month).toBe(1);
      expect(result?.year).toBe(2025);
    });

    it('should parse "Mar" and use current year (2025)', () => {
      const result = parseMonth('Mar');
      expect(result?.month).toBe(3);
      expect(result?.year).toBe(2025);
    });
  });

  describe('Case insensitivity', () => {
    it('should parse "JANUARY 2024" (uppercase)', () => {
      const result = parseMonth('JANUARY 2024');
      expect(result?.month).toBe(1);
      expect(result?.monthName).toBe('january');
    });

    it('should parse "january 2024" (lowercase)', () => {
      const result = parseMonth('january 2024');
      expect(result?.month).toBe(1);
    });

    it('should parse "January 2024" (mixed case)', () => {
      const result = parseMonth('January 2024');
      expect(result?.month).toBe(1);
    });
  });

  describe('All 12 months', () => {
    const months = [
      { name: 'January', abbr: 'Jan', num: 1, days: 31 },
      { name: 'February', abbr: 'Feb', num: 2, days: 28 }, // Non-leap year
      { name: 'March', abbr: 'Mar', num: 3, days: 31 },
      { name: 'April', abbr: 'Apr', num: 4, days: 30 },
      { name: 'May', abbr: 'May', num: 5, days: 31 },
      { name: 'June', abbr: 'Jun', num: 6, days: 30 },
      { name: 'July', abbr: 'Jul', num: 7, days: 31 },
      { name: 'August', abbr: 'Aug', num: 8, days: 31 },
      { name: 'September', abbr: 'Sep', num: 9, days: 30 },
      { name: 'October', abbr: 'Oct', num: 10, days: 31 },
      { name: 'November', abbr: 'Nov', num: 11, days: 30 },
      { name: 'December', abbr: 'Dec', num: 12, days: 31 },
    ];

    months.forEach(({ name, abbr, num, days }) => {
      it(`should parse ${name} (month ${num})`, () => {
        const result = parseMonth(`${name} 2023`);
        expect(result?.month).toBe(num);
        expect(result?.startDate).toBe(`2023-${String(num).padStart(2, '0')}-01`);
        expect(result?.endDate).toBe(`2023-${String(num).padStart(2, '0')}-${String(days).padStart(2, '0')}`);
      });

      it(`should parse ${abbr} (month ${num})`, () => {
        const result = parseMonth(`${abbr} 2023`);
        expect(result?.month).toBe(num);
      });
    });
  });

  describe('Edge cases', () => {
    it('should return null for invalid month name', () => {
      const result = parseMonth('InvalidMonth 2024');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseMonth('');
      expect(result).toBeNull();
    });
  });
});

describe('Date Parser - parseDateRange', () => {
  describe('From...to format', () => {
    it('should parse "from January to March 2024"', () => {
      const result = parseDateRange('from January to March 2024');
      expect(result).toBeDefined();
      expect(result?.type).toBe('range');
      expect(result?.startDate).toBe('2024-01-01');
      expect(result?.endDate).toBe('2024-03-31');
    });

    it('should parse "from Jan to Mar 2024"', () => {
      const result = parseDateRange('from Jan to Mar 2024');
      expect(result?.startDate).toBe('2024-01-01');
      expect(result?.endDate).toBe('2024-03-31');
    });
  });

  describe('Between...and format', () => {
    it('should parse "between January and March 2024"', () => {
      const result = parseDateRange('between January and March 2024');
      expect(result?.startDate).toBe('2024-01-01');
      expect(result?.endDate).toBe('2024-03-31');
    });

    it('should parse "between Feb and Apr 2024"', () => {
      const result = parseDateRange('between Feb and Apr 2024');
      expect(result?.startDate).toBe('2024-02-01');
      expect(result?.endDate).toBe('2024-04-30');
    });
  });

  describe('Without year (use current year)', () => {
    it('should parse "from January to March" and use current year (2025)', () => {
      const result = parseDateRange('from January to March');
      expect(result?.startDate).toBe('2025-01-01');
      expect(result?.endDate).toBe('2025-03-31');
    });
  });

  describe('Edge cases', () => {
    it('should return null for invalid range format', () => {
      const result = parseDateRange('not a range');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseDateRange('');
      expect(result).toBeNull();
    });
  });
});

describe('Date Parser - parseYear', () => {
  describe('4-digit year extraction', () => {
    it('should parse "2024"', () => {
      const result = parseYear('2024');
      expect(result).toBe(2024);
    });

    it('should parse "in 2023"', () => {
      const result = parseYear('in 2023');
      expect(result).toBe(2023);
    });

    it('should parse "for 2025"', () => {
      const result = parseYear('for 2025');
      expect(result).toBe(2025);
    });

    it('should parse year from longer sentence', () => {
      const result = parseYear('show production data for 2024 by shift');
      expect(result).toBe(2024);
    });
  });

  describe('Year range validation', () => {
    it('should accept years between 2000 and 2100', () => {
      expect(parseYear('2000')).toBe(2000);
      expect(parseYear('2024')).toBe(2024);
      expect(parseYear('2100')).toBe(2100);
    });
  });

  describe('Edge cases', () => {
    it('should return null for no year found', () => {
      const result = parseYear('no year here');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseYear('');
      expect(result).toBeNull();
    });

    it('should extract first year if multiple found', () => {
      const result = parseYear('compare 2023 and 2024');
      expect(result).toBe(2023);
    });
  });
});

describe('Date Parser - parseDate (main function)', () => {
  describe('Routing to correct parser', () => {
    it('should route quarter patterns to parseQuarter', () => {
      const result = parseDate('Q1 2024');
      expect(result?.type).toBe('quarter');
      expect(result?.quarter).toBe(1);
    });

    it('should route relative patterns to parseRelativeDate', () => {
      const result = parseDate('last month');
      expect(result?.type).toBe('range');
      expect(result?.relativePeriod).toBe('last_month');
    });

    it('should route month patterns to parseMonth', () => {
      const result = parseDate('January 2024');
      expect(result?.type).toBe('month');
      expect(result?.month).toBe(1);
    });

    it('should route range patterns to parseDateRange', () => {
      const result = parseDate('from January to March 2024');
      expect(result?.type).toBe('range');
      expect(result?.startDate).toBe('2024-01-01');
    });
  });

  describe('Priority order', () => {
    it('should prioritize quarter over month', () => {
      const result = parseDate('show Q1 data for January');
      // Quarter should take precedence
      expect(result?.type).toBe('quarter');
      expect(result?.quarter).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should return null for unparseable date', () => {
      const result = parseDate('not a date at all xyz 123');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseDate('');
      expect(result).toBeNull();
    });
  });
});

describe('Date Parser - dateToSQLFilter', () => {
  describe('Quarter to SQL', () => {
    it('should convert Q1 2024 to BETWEEN clause', () => {
      const parsed = parseQuarter('Q1 2024');
      const sql = dateToSQLFilter(parsed!, 'production_date');
      
      expect(sql).toContain('production_date');
      expect(sql).toContain('BETWEEN');
      expect(sql).toContain('2024-01-01');
      expect(sql).toContain('2024-03-31');
    });
  });

  describe('Month to SQL', () => {
    it('should convert January 2024 to BETWEEN clause', () => {
      const parsed = parseMonth('January 2024');
      const sql = dateToSQLFilter(parsed!, 'date');
      
      expect(sql).toContain('date');
      expect(sql).toContain('BETWEEN');
      expect(sql).toContain('2024-01-01');
      expect(sql).toContain('2024-01-31');
    });
  });

  describe('Relative date to SQL', () => {
    it('should convert "last month" to BETWEEN clause', () => {
      const parsed = parseRelativeDate('last month');
      const sql = dateToSQLFilter(parsed!, 'date_column');
      
      expect(sql).toContain('date_column');
      expect(sql).toContain('BETWEEN');
      expect(sql).toContain('2025-10-01');
      expect(sql).toContain('2025-10-31');
    });
  });

  describe('Date range to SQL', () => {
    it('should convert month range to BETWEEN clause', () => {
      const parsed = parseDateRange('from January to March 2024');
      const sql = dateToSQLFilter(parsed!, 'date_column');
      
      expect(sql).toContain('date_column');
      expect(sql).toContain('BETWEEN');
      expect(sql).toContain('2024-01-01');
      expect(sql).toContain('2024-03-31');
    });
  });

  describe('Column name parameter', () => {
    it('should use custom column name', () => {
      const parsed = parseQuarter('Q1 2024');
      const sql = dateToSQLFilter(parsed!, 'custom_date_col');
      
      expect(sql).toContain('custom_date_col');
      expect(sql).not.toContain('date_column');
    });

    it('should use default column name if not specified', () => {
      const parsed = parseQuarter('Q1 2024');
      const sql = dateToSQLFilter(parsed!);
      
      expect(sql).toContain('date'); // Default column name
    });
  });
});

describe('Date Parser - getQuarterDateRange', () => {
  describe('Q1 date range', () => {
    it('should return Jan 1 to Mar 31', () => {
      const { startDate, endDate } = getQuarterDateRange(1, 2024);
      
      expect(startDate).toBe('2024-01-01');
      expect(endDate).toBe('2024-03-31');
    });
  });

  describe('Q2 date range', () => {
    it('should return Apr 1 to Jun 30', () => {
      const { startDate, endDate } = getQuarterDateRange(2, 2024);
      
      expect(startDate).toBe('2024-04-01');
      expect(endDate).toBe('2024-06-30');
    });
  });

  describe('Q3 date range', () => {
    it('should return Jul 1 to Sep 30', () => {
      const { startDate, endDate } = getQuarterDateRange(3, 2024);
      
      expect(startDate).toBe('2024-07-01');
      expect(endDate).toBe('2024-09-30');
    });
  });

  describe('Q4 date range', () => {
    it('should return Oct 1 to Dec 31', () => {
      const { startDate, endDate } = getQuarterDateRange(4, 2024);
      
      expect(startDate).toBe('2024-10-01');
      expect(endDate).toBe('2024-12-31');
    });
  });

  describe('Leap year handling', () => {
    it('should handle Q1 in leap year 2024', () => {
      const { startDate, endDate } = getQuarterDateRange(1, 2024);
      
      expect(startDate).toBe('2024-01-01');
      expect(endDate).toBe('2024-03-31');
    });

    it('should handle Q1 in non-leap year 2023', () => {
      const { startDate, endDate } = getQuarterDateRange(1, 2023);
      
      expect(startDate).toBe('2023-01-01');
      expect(endDate).toBe('2023-03-31');
    });
  });

  describe('Year boundaries', () => {
    it('should handle different years correctly', () => {
      const range2020 = getQuarterDateRange(1, 2020);
      const range2030 = getQuarterDateRange(1, 2030);
      
      expect(range2020.startDate).toBe('2020-01-01');
      expect(range2030.startDate).toBe('2030-01-01');
    });
  });
});

describe('Date Parser - Integration Tests', () => {
  describe('Real-world query patterns', () => {
    it('should parse "show Q1 2024 production"', () => {
      const result = parseDate('show Q1 2024 production');
      expect(result?.type).toBe('quarter');
      expect(result?.quarter).toBe(1);
      expect(result?.year).toBe(2024);
    });

    it('should parse "show production for January 2024"', () => {
      const result = parseDate('show production for January 2024');
      expect(result?.type).toBe('month');
      expect(result?.month).toBe(1);
      expect(result?.year).toBe(2024);
    });

    it('should parse "show last month production"', () => {
      const result = parseDate('show last month production');
      expect(result?.type).toBe('range');
      expect(result?.relativePeriod).toBe('last_month');
    });

    it('should parse "compare January to March 2024"', () => {
      const result = parseDate('compare January to March 2024');
      expect(result).toBeDefined();
      expect(result?.startDate).toBe('2024-01-01');
      expect(result?.endDate).toBe('2024-03-31');
    });
  });

  describe('Complex queries with multiple date hints', () => {
    it('should handle query with quarter and year', () => {
      const result = parseDate('show Q1 2024 data');
      expect(result).toBeDefined();
      expect(result?.quarter).toBe(1);
      expect(result?.year).toBe(2024);
    });
  });

  describe('SQL generation integration', () => {
    it('should parse date and generate SQL filter', () => {
      const parsed = parseDate('Q1 2024');
      const sql = dateToSQLFilter(parsed!, 'production_date');
      
      expect(sql).toBeDefined();
      expect(sql).toContain('production_date BETWEEN');
      expect(sql).toContain('2024-01-01');
      expect(sql).toContain('2024-03-31');
    });
  });
});
