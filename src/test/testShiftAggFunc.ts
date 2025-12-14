/**
 * Direct test of shiftAggregationSQL
 */

import { buildShiftAggregationSQL } from '../router/builders/shifts';

const query = 'Compare total and average production by shift for January 2025';
const params = {
  parsed_date: {
    type: 'month',
    month: 1,
    monthName: 'january',
    year: 2025,
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    rawText: 'january 2025'
  },
  year: 2025,
  month: 1,
  month_name: 'january',
  date_start: '2025-01-01',
  date_end: '2025-01-31',
  shift: 'F',
  shift_count: 1
};

console.log('Calling buildShiftAggregationSQL...');
console.log('Query:', query);
console.log('Params:', JSON.stringify(params, null, 2));

const result = buildShiftAggregationSQL(params, query);
console.log('\nResult:', result);
