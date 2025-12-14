/**
 * Date utility functions for SQL generation
 */

import { type ParsedDate, dateToSQLFilter } from './dateParser';

export function getCurrentYear(): number {
  return new Date().getFullYear();
}

export function buildDateFilter(params: Record<string, any>): string {
  // Priority 1: Use comprehensive parsed_date if available (from dateParser)
  if (params.parsed_date) {
    const parsed = params.parsed_date as ParsedDate;
    const filter = dateToSQLFilter(parsed, 'date');
    return filter ? `WHERE ${filter}` : '';
  }
  
  // Priority 2: Legacy parameter handling for backward compatibility
  if (params.date_start && params.date_end) {
    // Explicit date range
    return `WHERE date BETWEEN '${params.date_start}' AND '${params.date_end}'`;
  }
  
  if (params.date) {
    return `WHERE date = '${params.date}'`;
  }
  
  if (params.year && params.quarter) {
    // Quarter with year (e.g., Q1 2024)
    const quarterMonths = {
      1: { start: 1, end: 3 },
      2: { start: 4, end: 6 },
      3: { start: 7, end: 9 },
      4: { start: 10, end: 12 }
    };
    const months = quarterMonths[params.quarter as keyof typeof quarterMonths];
    if (months) {
      const startDate = `${params.year}-${String(months.start).padStart(2, '0')}-01`;
      const lastDay = new Date(params.year, months.end, 0).getDate();
      const endDate = `${params.year}-${String(months.end).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return `WHERE date BETWEEN '${startDate}' AND '${endDate}'`;
    }
  }
  
  if (params.month && params.year) {
    // Month with year (e.g., January 2024)
    const lastDay = new Date(params.year, params.month, 0).getDate();
    const startDate = `${params.year}-${String(params.month).padStart(2, '0')}-01`;
    const endDate = `${params.year}-${String(params.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return `WHERE date BETWEEN '${startDate}' AND '${endDate}'`;
  }
  
  if (params.month) {
    // Month without year - assume current year
    const year = getCurrentYear();
    return `WHERE EXTRACT(MONTH FROM date) = ${params.month} AND EXTRACT(YEAR FROM date) = ${year}`;
  }
  
  if (params.year) {
    // Year only
    return `WHERE EXTRACT(YEAR FROM date) = ${params.year}`;
  }
  
  if (params.date_range) {
    switch (params.date_range) {
      case 'this_week':
        return `WHERE date >= CURRENT_DATE - INTERVAL '7 days'`;
      case 'this_month':
        return `WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)`;
      case 'this_year':
        return `WHERE EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)`;
      case 'last_week':
        return `WHERE date >= CURRENT_DATE - INTERVAL '14 days' AND date < CURRENT_DATE - INTERVAL '7 days'`;
      case 'last_month':
        return `WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month') AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')`;
      default:
        // Check for last_N_days pattern
        const lastNMatch = params.date_range.match(/last_(\d+)_(day|week|month|year)s?/);
        if (lastNMatch) {
          const num = parseInt(lastNMatch[1], 10);
          const unit = lastNMatch[2];
          return `WHERE date >= CURRENT_DATE - INTERVAL '${num} ${unit}s'`;
        }
        return '';
    }
  }
  
  return '';
}

export function buildShiftFilter(params: Record<string, any>, hasDateFilter: boolean): string {
  if (!params.shift) {
    return '';
  }

  const normalizeShiftToken = (s: unknown): string => {
    const raw = String(s ?? '').trim();
    if (!raw) return '';
    const mNum = raw.match(/^(?:shift\s*)?([123])$/i);
    if (mNum) return mNum[1] === '1' ? 'A' : mNum[1] === '2' ? 'B' : 'C';
    const mLetter = raw.match(/^(?:shift\s*)?([ABC])$/i);
    if (mLetter) return mLetter[1].toUpperCase();
    const m2 = raw.match(/\b([ABC])\b/i);
    if (m2) return m2[1].toUpperCase();
    const m3 = raw.match(/\b([123])\b/);
    if (m3) return m3[1] === '1' ? 'A' : m3[1] === '2' ? 'B' : 'C';
    return raw.toUpperCase();
  };

  const shiftVariants = (shift: string): string[] => {
    const canon = normalizeShiftToken(shift);
    if (canon === 'A' || canon === 'B' || canon === 'C') {
      const num = canon === 'A' ? '1' : canon === 'B' ? '2' : '3';
      return [
        canon,
        `Shift ${canon}`,
        `SHIFT ${canon}`,
        `shift ${canon}`,
        num,
        `Shift ${num}`,
        `SHIFT ${num}`,
        `shift ${num}`
      ];
    }
    return [shift];
  };
  
  // Normalize to array (handle both string and array)
  const shiftArray = Array.isArray(params.shift) ? params.shift : [params.shift];
  if (shiftArray.length === 0) {
    return '';
  }
  
  const prefix = hasDateFilter ? 'AND' : 'WHERE';
  const shiftsExpanded = shiftArray
    .flatMap((s: string) => shiftVariants(s))
    .map((s: string) => s.trim())
    .filter(Boolean);
  const uniqueShifts = Array.from(new Set(shiftsExpanded));
  const shifts = uniqueShifts.map((s: string) => `'${s}'`).join(', ');
  return `${prefix} shift IN (${shifts})`;
}
