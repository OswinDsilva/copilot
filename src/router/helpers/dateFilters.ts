/**
 * Additional date filter utilities specific to SQL builders
 * Complements the existing dateUtils.ts with builder-specific helpers
 */

import { getCurrentYear, buildDateFilter, buildShiftFilter } from './dateUtils';
import { extractMonthNumber } from './patterns';

/**
 * Build date filter for trip_summary_by_date table (uses trip_date column)
 */
export function buildTripDateFilter(params: Record<string, any>, query?: string): string {
  const monthNum = params.month || (query ? extractMonthNumber(query) : null);
  const year = params.year || getCurrentYear();
  
  if (params.date) {
    return `WHERE trip_date = '${params.date}'`;
  }
  
  if (params.date_start && params.date_end) {
    return `WHERE trip_date BETWEEN '${params.date_start}' AND '${params.date_end}'`;
  }
  
  if (monthNum) {
    const lastDay = new Date(year, monthNum, 0).getDate();
    const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return `WHERE trip_date BETWEEN '${startDate}' AND '${endDate}'`;
  }
  
  if (params.quarter) {
    const quarterStart = (params.quarter - 1) * 3 + 1;
    const quarterEnd = params.quarter * 3;
    return `WHERE EXTRACT(MONTH FROM trip_date) BETWEEN ${quarterStart} AND ${quarterEnd} AND EXTRACT(YEAR FROM trip_date) = ${year}`;
  }
  
  if (params.year) {
    return `WHERE EXTRACT(YEAR FROM trip_date) = ${year}`;
  }
  
  return '';
}

/**
 * Build combined date and shift filters
 */
export function buildDateAndShiftFilter(
  params: Record<string, any>,
  dateColumn: string = 'date'
): string {
  const dateFilter = dateColumn === 'trip_date' 
    ? buildTripDateFilter(params)
    : buildDateFilter(params);
  
  const shiftFilter = buildShiftFilter(params, !!dateFilter);
  
  return `${dateFilter}${shiftFilter}`;
}

/**
 * Build WHERE clause for combined filters
 */
export function buildCombinedWhereClause(
  dateFilter: string,
  shiftFilter: string,
  ...additionalFilters: string[]
): string {
  const filters = [dateFilter, shiftFilter, ...additionalFilters].filter(f => f.length > 0);
  
  if (filters.length === 0) return '';
  
  // If dateFilter already has WHERE, append others with AND
  if (dateFilter.startsWith('WHERE')) {
    const others = filters.slice(1).filter(f => !f.startsWith('WHERE') && !f.startsWith('AND'));
    if (others.length > 0) {
      return `${dateFilter} ${others.map(f => f.startsWith('AND') ? f : `AND ${f}`).join(' ')}`;
    }
    return dateFilter;
  }
  
  // Otherwise, add WHERE to the first filter
  return `WHERE ${filters.join(' AND ')}`;
}

/**
 * Build date range from month number and year
 */
export function buildMonthDateRange(monthNum: number, year?: number): {
  startDate: string;
  endDate: string;
} {
  const currentYear = year || getCurrentYear();
  const lastDay = new Date(currentYear, monthNum, 0).getDate();
  const startDate = `${currentYear}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = `${currentYear}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  
  return { startDate, endDate };
}

/**
 * Determine sort direction from query text
 */
export function getSortDirection(query: string): 'ASC' | 'DESC' {
  const isAscending = /(lowest|worst|least|bottom|ascending|asc)/i.test(query);
  return isAscending ? 'ASC' : 'DESC';
}

/**
 * Determine if query wants singular result (e.g., "the shift" vs "shifts")
 */
export function wantsSingularResult(query: string): boolean {
  return /\b(the|which)\s+(shift|tipper|excavator|date|day|month)\b/i.test(query);
}
