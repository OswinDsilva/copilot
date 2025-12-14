/**
 * Filter helper functions for building WHERE clause fragments
 * Centralizes equipment, shift, and other filter logic
 */

import { getCurrentYear } from './dateUtils';
import { extractMonthNumber } from './patterns';

/**
 * Build equipment filter for tipper or excavator
 * @param equipmentIds Array of equipment IDs
 * @param columnName Column name (default: 'tipper_id' or 'excavator')
 */
export function buildEquipmentFilter(
  equipmentIds: string[],
  columnName: 'tipper_id' | 'excavator' = 'tipper_id'
): string {
  if (!equipmentIds || equipmentIds.length === 0) return '';
  
  if (equipmentIds.length === 1) {
    return `${columnName} = '${equipmentIds[0]}'`;
  }
  
  return `${columnName} IN (${equipmentIds.map(id => `'${id}'`).join(', ')})`;
}

/**
 * Build shift filter clause
 * @param shifts Array of shift codes ('A', 'B', 'C', etc.)
 */
export function buildShiftFilterClause(shifts: string[]): string {
  if (!shifts || shifts.length === 0) return '';
  
  const shiftList = shifts.map(s => `'${s}'`).join(', ');
  return `shift IN (${shiftList})`;
}

/**
 * Build month filter for trip_date or date column
 * @param monthNum Month number (1-12)
 * @param year Year (defaults to current year)
 * @param dateColumn Column name (default: 'trip_date')
 */
export function buildMonthFilter(
  monthNum: number,
  year?: number,
  dateColumn: string = 'trip_date'
): string {
  const currentYear = year || getCurrentYear();
  return `EXTRACT(MONTH FROM ${dateColumn}) = ${monthNum} AND EXTRACT(YEAR FROM ${dateColumn}) = ${currentYear}`;
}

/**
 * Build date range filter
 * @param startDate Start date (YYYY-MM-DD)
 * @param endDate End date (YYYY-MM-DD)
 * @param dateColumn Column name (default: 'trip_date')
 */
export function buildDateRangeFilter(
  startDate: string,
  endDate: string,
  dateColumn: string = 'trip_date'
): string {
  return `${dateColumn} BETWEEN '${startDate}' AND '${endDate}'`;
}

/**
 * Build single date filter
 * @param date Date (YYYY-MM-DD)
 * @param dateColumn Column name (default: 'trip_date')
 */
export function buildSingleDateFilter(
  date: string,
  dateColumn: string = 'trip_date'
): string {
  return `${dateColumn} = '${date}'`;
}

/**
 * Build quarter filter
 * @param quarter Quarter number (1-4)
 * @param year Year
 * @param dateColumn Column name (default: 'trip_date')
 */
export function buildQuarterFilter(
  quarter: number,
  year: number,
  dateColumn: string = 'trip_date'
): string {
  const quarterStart = (quarter - 1) * 3 + 1;
  const quarterEnd = quarter * 3;
  return `EXTRACT(MONTH FROM ${dateColumn}) BETWEEN ${quarterStart} AND ${quarterEnd} AND EXTRACT(YEAR FROM ${dateColumn}) = ${year}`;
}

/**
 * Build comprehensive date filter from params
 * Returns both WHERE clause and individual condition string
 */
export function buildDateFilterFromParams(
  params: Record<string, any>,
  dateColumn: string = 'trip_date',
  query?: string
): { whereClause: string; condition: string } {
  const monthNum = params.month || (query ? extractMonthNumber(query) : null);
  const year = params.year || getCurrentYear();
  
  let condition = '';
  
  if (params.date) {
    condition = buildSingleDateFilter(params.date, dateColumn);
  } else if (params.date_start && params.date_end) {
    condition = buildDateRangeFilter(params.date_start, params.date_end, dateColumn);
  } else if (monthNum) {
    // For month filters, build complete date range
    const lastDay = new Date(year, monthNum, 0).getDate();
    const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    condition = buildDateRangeFilter(startDate, endDate, dateColumn);
  } else if (params.quarter) {
    condition = buildQuarterFilter(params.quarter, year, dateColumn);
  } else if (params.year) {
    condition = `EXTRACT(YEAR FROM ${dateColumn}) = ${year}`;
  }
  
  const whereClause = condition ? `WHERE ${condition}` : '';
  return { whereClause, condition };
}

/**
 * Combine multiple filter conditions with AND
 * Automatically handles empty strings
 */
export function combineFilters(...filters: string[]): string {
  const nonEmpty = filters.filter(f => f.length > 0);
  return nonEmpty.join(' AND ');
}

/**
 * Build WHERE clause from multiple conditions
 * Automatically adds WHERE keyword if conditions exist
 */
export function buildWhereClause(...conditions: string[]): string {
  const combined = combineFilters(...conditions);
  return combined ? `WHERE ${combined}` : '';
}

/**
 * Determine equipment column based on query or equipment ID pattern
 */
export function getEquipmentColumn(query: string, equipmentIds?: string[]): 'tipper_id' | 'excavator' {
  // Check query text
  const isTipper = /\b(tipper|dumper|BB-\d+|DT-\d+)\b/i.test(query);
  
  // Check equipment ID prefix if provided
  if (equipmentIds && equipmentIds.length > 0) {
    if (/^(BB-|DT-)/i.test(equipmentIds[0])) return 'tipper_id';
    if (/^EX-/i.test(equipmentIds[0])) return 'excavator';
  }
  
  return isTipper ? 'tipper_id' : 'excavator';
}

/**
 * Detect if query is asking about tippers or excavators
 */
/**
 * Validate equipment ID against expected type
 * BB- prefix = tipper only
 * EX- prefix = excavator only
 */
export function validateEquipmentId(equipmentId: string, column: 'tipper_id' | 'excavator'): boolean {
  const id = equipmentId.toUpperCase();
  
  if (column === 'tipper_id') {
    // Only BB- and DT- prefixes are valid for tippers
    return /^(BB-|DT-)/.test(id);
  } else {
    // Only EX- prefix is valid for excavators
    return /^EX-/.test(id);
  }
}

export function detectEquipmentType(query: string, equipmentIds?: string[]): {
  isTipper: boolean;
  isExcavator: boolean;
  column: 'tipper_id' | 'excavator';
} {
  const isTipper = /\b(tipper|dumper|BB-\d+|DT-\d+)\b/i.test(query) || 
                   !!(equipmentIds?.[0] && /^(BB-|DT-)/.test(equipmentIds[0]));
  const isExcavator = /\b(excavator|EX-\d+)\b/i.test(query) || 
                      !!(equipmentIds?.[0] && /^EX-/.test(equipmentIds[0]));
  
  return {
    isTipper,
    isExcavator,
    column: isTipper ? 'tipper_id' : 'excavator'
  };
}
